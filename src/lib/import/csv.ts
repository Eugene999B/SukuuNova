export const CSV_IMPORT_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxRows: 5000,
  maxColumns: 100,
  maxCellCharacters: 10000,
} as const;

export type ParsedCsv = {
  headers: string[];
  normalizedHeaders: string[];
  rows: Array<{ rowNumber: number; values: string[]; record: Record<string, string> }>;
};

export class CsvImportError extends Error {
  constructor(message: string, public readonly code: string, public readonly rowNumber?: number) {
    super(message);
    this.name = "CsvImportError";
  }
}

export function normalizeImportHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function finishCell(row: string[], value: string, rowNumber: number) {
  if (value.length > CSV_IMPORT_LIMITS.maxCellCharacters) {
    throw new CsvImportError(`Row ${rowNumber} contains a cell that is too long.`, "CSV_CELL_TOO_LONG", rowNumber);
  }
  row.push(value);
  if (row.length > CSV_IMPORT_LIMITS.maxColumns) {
    throw new CsvImportError(`Row ${rowNumber} exceeds the maximum column count.`, "CSV_TOO_MANY_COLUMNS", rowNumber);
  }
}

function isBlankRow(values: string[]) {
  return values.every((value) => value.trim() === "");
}

export function parseCsvImport(input: string): ParsedCsv {
  if (typeof input !== "string") throw new CsvImportError("CSV content must be text.", "CSV_NOT_TEXT");
  if (Buffer.byteLength(input, "utf8") > CSV_IMPORT_LIMITS.maxBytes) {
    throw new CsvImportError("CSV file exceeds the 5 MB import limit.", "CSV_TOO_LARGE");
  }
  if (input.includes("\0")) throw new CsvImportError("CSV contains invalid null bytes.", "CSV_INVALID_BYTES");

  const text = input.replace(/^\uFEFF/, "");
  const parsedRows: Array<{ rowNumber: number; values: string[] }> = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let rowNumber = 1;

  const pushRow = () => {
    finishCell(row, cell, rowNumber);
    if (!isBlankRow(row)) parsedRows.push({ rowNumber, values: row });
    row = [];
    cell = "";
    rowNumber += 1;
    if (parsedRows.length > CSV_IMPORT_LIMITS.maxRows + 1) {
      throw new CsvImportError(`CSV exceeds the ${CSV_IMPORT_LIMITS.maxRows} data-row limit.`, "CSV_TOO_MANY_ROWS", rowNumber);
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      if (cell.length !== 0) throw new CsvImportError(`Unexpected quote in row ${rowNumber}.`, "CSV_MALFORMED_QUOTE", rowNumber);
      inQuotes = true;
    } else if (char === ",") {
      finishCell(row, cell, rowNumber);
      cell = "";
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      cell += char;
    }
  }

  if (inQuotes) throw new CsvImportError(`Unclosed quoted field in row ${rowNumber}.`, "CSV_UNCLOSED_QUOTE", rowNumber);
  if (cell.length || row.length) pushRow();
  if (!parsedRows.length) throw new CsvImportError("CSV is empty.", "CSV_EMPTY");

  const headers = parsedRows[0].values.map((value) => value.trim());
  if (!headers.length || headers.some((header) => !header)) {
    throw new CsvImportError("Every CSV column must have a header.", "CSV_HEADER_REQUIRED", parsedRows[0].rowNumber);
  }
  const normalizedHeaders = headers.map(normalizeImportHeader);
  if (normalizedHeaders.some((header) => !header)) {
    throw new CsvImportError("CSV contains an unusable header.", "CSV_HEADER_INVALID", parsedRows[0].rowNumber);
  }
  const duplicates = normalizedHeaders.filter((header, index) => normalizedHeaders.indexOf(header) !== index);
  if (duplicates.length) {
    throw new CsvImportError(`CSV contains duplicate headers after normalization: ${[...new Set(duplicates)].join(", ")}.`, "CSV_DUPLICATE_HEADERS", parsedRows[0].rowNumber);
  }

  const dataRows = parsedRows.slice(1);
  if (dataRows.length > CSV_IMPORT_LIMITS.maxRows) {
    throw new CsvImportError(`CSV exceeds the ${CSV_IMPORT_LIMITS.maxRows} data-row limit.`, "CSV_TOO_MANY_ROWS");
  }
  const rows = dataRows.map(({ rowNumber: sourceRowNumber, values }) => {
    if (values.length !== headers.length) {
      throw new CsvImportError(`Row ${sourceRowNumber} has ${values.length} columns; expected ${headers.length}.`, "CSV_COLUMN_MISMATCH", sourceRowNumber);
    }
    return {
      rowNumber: sourceRowNumber,
      values,
      record: Object.fromEntries(normalizedHeaders.map((header, index) => [header, values[index] ?? ""])),
    };
  });

  return { headers, normalizedHeaders, rows };
}
