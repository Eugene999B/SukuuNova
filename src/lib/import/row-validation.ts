import { IMPORT_CONTRACTS, type ColumnMapping, type ImportFieldDefinition, type ImportKind } from "./contracts";
import { normalizeImportHeader, type ParsedCsv } from "./csv";

export type ImportRowIssue = {
  field: string | null;
  code: string;
  message: string;
};

export type ValidatedImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: Record<string, string | number | boolean | null>;
  issues: ImportRowIssue[];
  duplicateKeys: string[];
  status: "valid" | "invalid" | "duplicate";
};

export type ImportValidationSummary = {
  rows: ValidatedImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
};

const MAX_TEXT_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return trimmed;
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return undefined;
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/,/g, "").replace(/^ghs\s*/i, "").replace(/^₵\s*/, "");
  if (!normalized) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000 ? Math.round(amount * 100) / 100 : undefined;
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(compact)) return undefined;
  return compact;
}

function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return undefined;
  return normalized;
}

function normalizeField(definition: ImportFieldDefinition, rawValue: string): { value: string | number | boolean | null; issue?: ImportRowIssue } {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return definition.required
      ? { value: null, issue: { field: definition.key, code: "required", message: `${definition.label} is required.` } }
      : { value: null };
  }

  if (definition.type === "date") {
    const value = parseDate(trimmed);
    return value == null
      ? { value: null, issue: { field: definition.key, code: "invalid_date", message: `${definition.label} must use YYYY-MM-DD.` } }
      : { value };
  }
  if (definition.type === "boolean") {
    const value = parseBoolean(trimmed);
    return value === undefined
      ? { value: null, issue: { field: definition.key, code: "invalid_boolean", message: `${definition.label} must be Yes/No or True/False.` } }
      : { value };
  }
  if (definition.type === "money") {
    const value = parseMoney(trimmed);
    return value === undefined
      ? { value: null, issue: { field: definition.key, code: "invalid_money", message: `${definition.label} must be a non-negative amount with at most 2 decimal places.` } }
      : { value };
  }
  if (definition.type === "phone") {
    const value = normalizePhone(trimmed);
    return value === undefined
      ? { value: null, issue: { field: definition.key, code: "invalid_phone", message: `${definition.label} must contain 7 to 15 digits, with an optional leading +.` } }
      : { value };
  }
  if (definition.type === "email") {
    const value = normalizeEmail(trimmed);
    return value === undefined
      ? { value: null, issue: { field: definition.key, code: "invalid_email", message: `${definition.label} is not a valid email address.` } }
      : { value };
  }

  const value = normalizeText(trimmed);
  const max = definition.key === "description" ? MAX_DESCRIPTION_LENGTH : MAX_TEXT_LENGTH;
  if (value.length > max) {
    return { value: null, issue: { field: definition.key, code: "text_too_long", message: `${definition.label} exceeds the ${max}-character limit.` } };
  }
  return { value };
}

function mappedHeader(mapping: ColumnMapping, fieldKey: string) {
  const header = mapping[fieldKey];
  return header ? normalizeImportHeader(header) : null;
}

function valueKey(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : value == null ? "" : String(value);
}

export function duplicateKeysForNormalizedRow(kind: ImportKind, normalized: Record<string, string | number | boolean | null>) {
  const keys: string[] = [];
  const add = (prefix: string, value: unknown) => {
    const key = valueKey(value);
    if (key) keys.push(`${prefix}:${key}`);
  };

  if (kind === "students") add("student:admission", normalized.admissionNo);
  if (kind === "guardians") {
    add("guardian:phone", normalized.phone);
    add("guardian:email", normalized.email);
  }
  if (kind === "staff") {
    add("staff:email", normalized.email);
    add("staff:phone", normalized.phone);
  }
  if (kind === "classes") add("class:name", normalized.name);
  if (kind === "subjects") add("subject:name", normalized.name);
  if (kind === "opening_balances") add("opening_balance:student", normalized.studentAdmissionNo);
  return keys;
}

export function validateMappedImportRows(kind: ImportKind, parsed: ParsedCsv, mapping: ColumnMapping): ImportValidationSummary {
  const contract = IMPORT_CONTRACTS[kind];
  const rows: ValidatedImportRow[] = parsed.rows.map((source) => {
    const normalized: Record<string, string | number | boolean | null> = {};
    const issues: ImportRowIssue[] = [];

    for (const definition of contract.fields) {
      const header = mappedHeader(mapping, definition.key);
      const raw = header ? source.record[header] ?? "" : "";
      if (!header && definition.required) {
        issues.push({ field: definition.key, code: "mapping_required", message: `${definition.label} must be mapped before validation.` });
        normalized[definition.key] = null;
        continue;
      }
      const result = normalizeField(definition, raw);
      normalized[definition.key] = result.value;
      if (result.issue) issues.push(result.issue);
    }

    if (kind === "students" && normalized.guardianPhone && !normalized.guardianName) {
      issues.push({ field: "guardianName", code: "guardian_name_required", message: "Guardian name is required when a guardian phone is provided." });
    }
    if (kind === "guardians" && !normalized.phone && !normalized.email) {
      issues.push({ field: null, code: "guardian_contact_required", message: "Guardian phone or email is required." });
    }
    if (kind === "staff" && !normalized.phone && !normalized.email) {
      issues.push({ field: null, code: "staff_contact_required", message: "Staff phone or email is required." });
    }

    return {
      rowNumber: source.rowNumber,
      raw: source.record,
      normalized,
      issues,
      duplicateKeys: duplicateKeysForNormalizedRow(kind, normalized),
      status: issues.length ? "invalid" : "valid",
    };
  });

  const keyRows = new Map<string, number[]>();
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].issues.length) continue;
    for (const key of rows[index].duplicateKeys) {
      const indexes = keyRows.get(key) ?? [];
      indexes.push(index);
      keyRows.set(key, indexes);
    }
  }
  for (const [key, indexes] of keyRows) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      rows[index].issues.push({ field: null, code: "duplicate_in_file", message: `Duplicate import identity detected: ${key}.` });
      rows[index].status = "duplicate";
    }
  }

  return {
    rows,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === "valid").length,
    invalidRows: rows.filter((row) => row.status === "invalid").length,
    duplicateRows: rows.filter((row) => row.status === "duplicate").length,
  };
}
