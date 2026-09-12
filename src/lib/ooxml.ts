type ZipFile = { name: string; data: string | Buffer };

type WorkbookSheet = {
  name: string;
  rows: Array<Array<string | number | boolean | null | undefined>>;
};

type DocumentSection = {
  title: string;
  paragraphs?: string[];
  rows?: Array<[string, string]>;
  table?: { headers: string[]; rows: string[][] };
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(now = new Date()) {
  const year = Math.max(1980, now.getUTCFullYear());
  const date = ((year - 1980) << 9) | ((now.getUTCMonth() + 1) << 5) | now.getUTCDate();
  const time = (now.getUTCHours() << 11) | (now.getUTCMinutes() << 5) | Math.floor(now.getUTCSeconds() / 2);
  return { date, time };
}

/** Create a small standards-compliant ZIP archive using the STORE method. */
export function createStoredZip(files: ZipFile[]) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const stamp = dosTimestamp();

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(stamp.time, 12);
    directory.writeUInt16LE(stamp.date, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += local.length + name.length + data.length;
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...central, end]);
}

function xml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wordParagraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${xml(style)}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

function wordCell(text: string, bold = false) {
  const runProps = bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p><w:r>${runProps}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p></w:tc>`;
}

function wordTable(headers: string[], rows: string[][]) {
  const borders = `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C2CC"/><w:left w:val="single" w:sz="4" w:color="B8C2CC"/><w:bottom w:val="single" w:sz="4" w:color="B8C2CC"/><w:right w:val="single" w:sz="4" w:color="B8C2CC"/><w:insideH w:val="single" w:sz="4" w:color="D7DEE5"/><w:insideV w:val="single" w:sz="4" w:color="D7DEE5"/></w:tblBorders></w:tblPr>`;
  const header = `<w:tr>${headers.map((value) => wordCell(value, true)).join("")}</w:tr>`;
  const body = rows.map((row) => `<w:tr>${headers.map((_, index) => wordCell(row[index] ?? "")).join("")}</w:tr>`).join("");
  return `<w:tbl>${borders}${header}${body}</w:tbl>`;
}

export function createDocx(input: { title: string; subtitle?: string; generatedAt?: string; sections: DocumentSection[] }) {
  const body: string[] = [wordParagraph(input.title, "Title")];
  if (input.subtitle) body.push(wordParagraph(input.subtitle, "Subtitle"));
  if (input.generatedAt) body.push(wordParagraph(`Generated ${input.generatedAt}`, "Meta"));
  for (const section of input.sections) {
    body.push(wordParagraph(section.title, "Heading1"));
    for (const paragraph of section.paragraphs ?? []) body.push(wordParagraph(paragraph));
    if (section.rows?.length) body.push(wordTable(["Field", "Value"], section.rows.map(([label, value]) => [label, value])));
    if (section.table) body.push(wordTable(section.table.headers, section.table.rows));
  }
  body.push(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="540" w:footer="540" w:gutter="0"/></w:sectPr>`);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}</w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="38"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="566573"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="7A8792"/><w:sz w:val="17"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="27"/><w:color w:val="17324D"/></w:rPr></w:style></w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const now = new Date().toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(input.title)}</dc:title><dc:creator>SukuuNova</dc:creator><cp:lastModifiedBy>SukuuNova</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>SukuuNova</Application><AppVersion>1.0</AppVersion></Properties>`;
  return createStoredZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "word/document.xml", data: documentXml },
    { name: "word/styles.xml", data: stylesXml },
    { name: "word/_rels/document.xml.rels", data: documentRels },
    { name: "docProps/core.xml", data: core },
    { name: "docProps/app.xml", data: app },
  ]);
}

function columnName(index: number) {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function safeSheetNames(names: string[]) {
  const used = new Set<string>();
  return names.map((raw, index) => {
    const base = (raw.replace(/[\\/*?:[\]]/g, " ").trim() || `Sheet ${index + 1}`).slice(0, 31);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      const marker = ` ${suffix++}`;
      candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function xlsxCell(value: string | number | boolean | null | undefined, row: number, column: number, header: boolean) {
  const ref = `${columnName(column)}${row}`;
  const style = header ? ` s="1"` : "";
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"${style}><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value ?? "")}</t></is></c>`;
}

export function createXlsx(sheets: WorkbookSheet[]) {
  const normalized = sheets.length ? sheets : [{ name: "Report", rows: [["No data"]] }];
  const names = safeSheetNames(normalized.map((sheet) => sheet.name));
  const files: ZipFile[] = [];
  const sheetOverrides: string[] = [];
  const workbookSheets: string[] = [];
  const workbookRels: string[] = [];

  normalized.forEach((sheet, index) => {
    const sheetId = index + 1;
    const rows = sheet.rows.map((values, rowIndex) => `<row r="${rowIndex + 1}">${values.map((value, columnIndex) => xlsxCell(value, rowIndex + 1, columnIndex, rowIndex === 0)).join("")}</row>`).join("");
    files.push({ name: `xl/worksheets/sheet${sheetId}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rows}</sheetData></worksheet>` });
    sheetOverrides.push(`<Override PartName="/xl/worksheets/sheet${sheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    workbookSheets.push(`<sheet name="${xml(names[index])}" sheetId="${sheetId}" r:id="rId${sheetId}"/>`);
    workbookRels.push(`<Relationship Id="rId${sheetId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetId}.xml"/>`);
  });

  const stylesRelId = normalized.length + 1;
  workbookRels.push(`<Relationship Id="rId${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  files.push({ name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides.join("")}</Types>` });
  files.push({ name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  files.push({ name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets.join("")}</sheets></workbook>` });
  files.push({ name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels.join("")}</Relationships>` });
  files.push({ name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` });
  return createStoredZip(files);
}
