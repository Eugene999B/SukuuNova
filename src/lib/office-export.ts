function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function spreadsheetSafe(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function officeTableHtml(input: { title: string; subtitle?: string; headers: string[]; rows: unknown[][]; spreadsheet?: boolean }) {
  const cell = (value: unknown) => escapeHtml(input.spreadsheet ? spreadsheetSafe(value) : value);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:22px;margin:0 0 4px}p{color:#555;margin:0 0 18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#eee;font-weight:700}</style></head><body><h1>${escapeHtml(input.title)}</h1>${input.subtitle ? `<p>${escapeHtml(input.subtitle)}</p>` : ""}<table><thead><tr>${input.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${input.rows.map((row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
}

export function officeDownloadResponse(input: { format: "xls" | "doc"; filename: string; title: string; subtitle?: string; headers: string[]; rows: unknown[][] }) {
  const excel = input.format === "xls";
  const body = officeTableHtml({ title: input.title, subtitle: input.subtitle, headers: input.headers, rows: input.rows, spreadsheet: excel });
  return new Response(body, {
    headers: {
      "content-type": excel ? "application/vnd.ms-excel; charset=utf-8" : "application/msword; charset=utf-8",
      "content-disposition": `attachment; filename="${input.filename}.${input.format}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
