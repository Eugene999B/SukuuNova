import { normalizeImportHeader } from "./csv";

export type ImportKind = "students" | "guardians" | "staff" | "classes" | "subjects" | "opening_balances";
export type ImportFieldType = "text" | "email" | "phone" | "date" | "boolean" | "money";

export type ImportFieldDefinition = {
  key: string;
  label: string;
  type: ImportFieldType;
  required: boolean;
  aliases: string[];
  description: string;
};

export type ImportContract = {
  kind: ImportKind;
  label: string;
  description: string;
  fields: ImportFieldDefinition[];
};

function field(input: Omit<ImportFieldDefinition, "aliases"> & { aliases?: string[] }): ImportFieldDefinition {
  const aliases = [input.key, input.label, ...(input.aliases ?? [])]
    .map(normalizeImportHeader)
    .filter(Boolean);
  return { ...input, aliases: [...new Set(aliases)] };
}

export const IMPORT_CONTRACTS: Record<ImportKind, ImportContract> = {
  students: {
    kind: "students",
    label: "Learners",
    description: "Import learners, optional class assignment and an optional primary guardian in one batch.",
    fields: [
      field({ key: "name", label: "Learner name", type: "text", required: true, aliases: ["student name", "full name", "learner"], description: "Full learner name." }),
      field({ key: "admissionNo", label: "Admission number", type: "text", required: false, aliases: ["admission no", "index number", "student id", "learner id"], description: "Existing school admission/index number. SukuuNova may generate one when omitted during apply." }),
      field({ key: "dob", label: "Date of birth", type: "date", required: false, aliases: ["date of birth", "birth date", "birthday"], description: "Learner date of birth." }),
      field({ key: "className", label: "Class", type: "text", required: false, aliases: ["class name", "form", "grade"], description: "Existing SukuuNova class name to match." }),
      field({ key: "guardianName", label: "Guardian name", type: "text", required: false, aliases: ["parent name", "primary guardian", "guardian"], description: "Optional primary guardian name." }),
      field({ key: "guardianPhone", label: "Guardian phone", type: "phone", required: false, aliases: ["parent phone", "guardian mobile", "parent mobile"], description: "Optional primary guardian phone number." }),
      field({ key: "guardianRelationship", label: "Guardian relationship", type: "text", required: false, aliases: ["relationship", "parent relationship"], description: "Relationship such as Mother, Father, Parent or Guardian." }),
    ],
  },
  guardians: {
    kind: "guardians",
    label: "Guardians",
    description: "Import guardian contacts and optionally link them to an existing learner by admission number.",
    fields: [
      field({ key: "name", label: "Guardian name", type: "text", required: true, aliases: ["parent name", "full name"], description: "Full guardian name." }),
      field({ key: "phone", label: "Phone", type: "phone", required: false, aliases: ["mobile", "phone number", "guardian phone"], description: "Guardian phone number used for matching and communication." }),
      field({ key: "email", label: "Email", type: "email", required: false, aliases: ["email address", "guardian email"], description: "Guardian email address." }),
      field({ key: "studentAdmissionNo", label: "Learner admission number", type: "text", required: false, aliases: ["student admission no", "admission number", "student id", "learner id"], description: "Existing learner admission number to link." }),
      field({ key: "relationship", label: "Relationship", type: "text", required: false, aliases: ["guardian relationship", "parent relationship"], description: "Relationship to the learner." }),
      field({ key: "isPrimary", label: "Primary guardian", type: "boolean", required: false, aliases: ["primary", "main guardian"], description: "Whether this is the learner's primary guardian." }),
    ],
  },
  staff: {
    kind: "staff",
    label: "Staff & teachers",
    description: "Stage staff identities and role intentions. Login creation remains a separate controlled apply step.",
    fields: [
      field({ key: "name", label: "Staff name", type: "text", required: true, aliases: ["employee name", "teacher name", "full name"], description: "Full staff name." }),
      field({ key: "email", label: "Email", type: "email", required: false, aliases: ["email address", "work email"], description: "Staff email address." }),
      field({ key: "phone", label: "Phone", type: "phone", required: false, aliases: ["mobile", "phone number"], description: "Staff phone number." }),
      field({ key: "role", label: "Role", type: "text", required: false, aliases: ["job role", "system role", "position"], description: "Existing SukuuNova role name to assign during controlled apply." }),
    ],
  },
  classes: {
    kind: "classes",
    label: "Classes",
    description: "Import class structure before assigning learners and teachers.",
    fields: [
      field({ key: "name", label: "Class name", type: "text", required: true, aliases: ["class", "form", "grade name"], description: "Class name." }),
      field({ key: "level", label: "Level", type: "text", required: false, aliases: ["class level", "grade level", "standard"], description: "Optional level or standard label." }),
      field({ key: "classTeacherEmail", label: "Class teacher email", type: "email", required: false, aliases: ["teacher email", "form teacher email", "class teacher"], description: "Existing staff email to assign as class teacher during apply." }),
    ],
  },
  subjects: {
    kind: "subjects",
    label: "Subjects",
    description: "Import the subject catalogue used across teaching, timetable and gradebook.",
    fields: [
      field({ key: "name", label: "Subject name", type: "text", required: true, aliases: ["subject", "course", "course name"], description: "Subject name." }),
    ],
  },
  opening_balances: {
    kind: "opening_balances",
    label: "Opening fee balances",
    description: "Stage legacy learner balances for finance review. Posting into the ledger requires a separate finance-safe apply step.",
    fields: [
      field({ key: "studentAdmissionNo", label: "Learner admission number", type: "text", required: true, aliases: ["student admission no", "admission number", "student id", "learner id"], description: "Existing learner admission number." }),
      field({ key: "amount", label: "Opening balance", type: "money", required: true, aliases: ["amount", "balance", "arrears", "outstanding balance"], description: "Legacy amount owed by the learner." }),
      field({ key: "description", label: "Description", type: "text", required: false, aliases: ["note", "narration", "reason"], description: "Optional source/narration for the opening balance." }),
    ],
  },
};

export function importContract(kind: string): ImportContract | null {
  return Object.prototype.hasOwnProperty.call(IMPORT_CONTRACTS, kind) ? IMPORT_CONTRACTS[kind as ImportKind] : null;
}

export type ColumnMapping = Record<string, string | null>;

export function suggestColumnMapping(kind: ImportKind, normalizedHeaders: string[]): ColumnMapping {
  const contract = IMPORT_CONTRACTS[kind];
  const available = new Set(normalizedHeaders);
  const claimed = new Set<string>();
  const mapping: ColumnMapping = {};

  for (const definition of contract.fields) {
    const match = definition.aliases.find((alias) => available.has(alias) && !claimed.has(alias)) ?? null;
    mapping[definition.key] = match;
    if (match) claimed.add(match);
  }
  return mapping;
}

export function validateColumnMapping(kind: ImportKind, normalizedHeaders: string[], mapping: ColumnMapping) {
  const contract = IMPORT_CONTRACTS[kind];
  const headers = new Set(normalizedHeaders);
  const fieldKeys = new Set(contract.fields.map((definition) => definition.key));
  const errors: string[] = [];
  const usedHeaders = new Map<string, string>();

  for (const [fieldKey, header] of Object.entries(mapping)) {
    if (!fieldKeys.has(fieldKey)) {
      errors.push(`Unknown import field: ${fieldKey}.`);
      continue;
    }
    if (header == null || header === "") continue;
    const normalized = normalizeImportHeader(header);
    if (!headers.has(normalized)) {
      errors.push(`Mapped column ${header} is not present in the CSV.`);
      continue;
    }
    const alreadyUsed = usedHeaders.get(normalized);
    if (alreadyUsed && alreadyUsed !== fieldKey) {
      errors.push(`CSV column ${normalized} is mapped to more than one field.`);
    } else {
      usedHeaders.set(normalized, fieldKey);
    }
  }

  for (const definition of contract.fields.filter((item) => item.required)) {
    const mapped = mapping[definition.key];
    if (!mapped || !headers.has(normalizeImportHeader(mapped))) {
      errors.push(`${definition.label} must be mapped.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
