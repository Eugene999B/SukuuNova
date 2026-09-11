import encodeQR from "qr";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

const PT_PER_MM = 72 / 25.4;
const CARD_WIDTH = 85.6 * PT_PER_MM;
const CARD_HEIGHT = 53.98 * PT_PER_MM;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const BULK_GAP_X = 8;
const BULK_GAP_Y = 8;

export type IdentityCardArtworkSide = "front" | "back";

type ArtworkCard = {
  personType: "student" | "staff";
  personName: string;
  personNumber?: string | null;
  admissionNo?: string | null;
  className?: string | null;
  houseName?: string | null;
  roleName?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  photoUrl?: string | null;
  serial: string;
  issuedAt: Date;
  expiresAt: Date;
  status: "active" | "revoked";
};

type ArtworkSchool = {
  name: string;
  uniqueCode: string;
  logoUrl?: string | null;
  brandColors?: unknown;
};

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function short(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function safeImage(value: string | null | undefined) {
  if (!value) return null;
  if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return value.replace(/\s+/g, "");
  if (/^https:\/\//i.test(value)) return value;
  return null;
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "SN";
}

function date(value: Date) {
  return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function brandHex(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const safe = (candidate: unknown, fallback: string) => typeof candidate === "string" && /^#?[0-9a-f]{6}$/i.test(candidate)
    ? (candidate.startsWith("#") ? candidate : `#${candidate}`)
    : fallback;
  return {
    primary: safe(row.primary ?? row.primaryColor, "#082238"),
    accent: safe(row.accent ?? row.secondary, "#16c7b7"),
  };
}

function qrMatrix(value: string) {
  const raw = encodeQR(value, "raw", { ecc: "high" }) as unknown;
  return Array.isArray(raw)
    ? raw.map((row) => Array.isArray(row) ? row : Array.from(row as ArrayLike<unknown>))
    : [];
}

function qrPath(value: string, x: number, y: number, size: number) {
  const matrix = qrMatrix(value);
  const count = matrix.length;
  if (!count) return "";
  const quiet = 4;
  const unit = size / (count + quiet * 2);
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix[row]?.[column] === 1 || matrix[row]?.[column] === true || matrix[row]?.[column] === "1") {
        const px = x + (column + quiet) * unit;
        const py = y + (row + quiet) * unit;
        path += `M${px.toFixed(2)} ${py.toFixed(2)}h${unit.toFixed(2)}v${unit.toFixed(2)}h-${unit.toFixed(2)}z`;
      }
    }
  }
  return path;
}

function qrOnlySvg(value: string) {
  const size = 220;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="220" height="220"><rect width="220" height="220" fill="#fff"/><path d="${qrPath(value, 0, 0, size)}" fill="#081f32"/></svg>`;
}

export function identityCardQrSvgDataUri(value: string) {
  return `data:image/svg+xml,${encodeURIComponent(qrOnlySvg(value))}`;
}

function imageOrInitials(url: string | null | undefined, name: string, x: number, y: number, width: number, height: number, clipId: string, primary: string, fit: "cover" | "contain") {
  const safe = safeImage(url);
  if (safe) {
    return `<image href="${xml(safe)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid ${fit === "cover" ? "slice" : "meet"}" clip-path="url(#${clipId})"/>`;
  }
  const cx = x + width / 2;
  const cy = y + height / 2 + 14;
  return `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="52" fill="${primary}">${xml(initials(name))}</text>`;
}

function svgShell(content: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="85.6mm" height="53.98mm" viewBox="0 0 856 539.8" role="img">${content}</svg>`;
}

function securityPattern(primary: string, accent: string) {
  const lines = Array.from({ length: 16 }, (_, index) => {
    const offset = index * 70 - 170;
    return `<path d="M${offset} 540 L${offset + 250} 0" stroke="${index % 2 ? primary : accent}" stroke-width="2" opacity="0.035"/>`;
  }).join("");
  const rings = Array.from({ length: 5 }, (_, index) => `<circle cx="785" cy="340" r="${40 + index * 28}" fill="none" stroke="${index % 2 ? primary : accent}" stroke-width="2" opacity="0.035"/>`).join("");
  return `${lines}${rings}`;
}

function frontSvg(card: ArtworkCard, school: ArtworkSchool) {
  const { primary, accent } = brandHex(school.brandColors);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const role = card.personType === "student" ? (card.className || "Not assigned") : (card.roleName || "Staff member");
  const active = card.status === "active" && card.expiresAt.getTime() > Date.now();
  const status = active ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED";
  const statusColor = active ? "#18753d" : "#a52b2b";
  const statusFill = active ? "#edf8f0" : "#fff0f0";
  const logo = imageOrInitials(school.logoUrl, school.name, 31, 30, 82, 82, "logoClip", primary, "contain");
  const portrait = imageOrInitials(card.photoUrl, card.personName, 36, 178, 225, 244, "portraitClip", primary, "cover");
  return svgShell(`
    <defs>
      <clipPath id="logoClip"><rect x="31" y="30" width="82" height="82" rx="13"/></clipPath>
      <clipPath id="portraitClip"><rect x="36" y="178" width="225" height="244" rx="18"/></clipPath>
    </defs>
    <rect width="856" height="539.8" rx="26" fill="#ffffff"/>
    ${securityPattern(primary, accent)}
    <rect width="856" height="142" rx="26" fill="${primary}"/>
    <rect y="132" width="856" height="12" fill="${accent}"/>
    <rect x="31" y="30" width="82" height="82" rx="13" fill="#fff" stroke="${accent}" stroke-width="3"/>
    ${logo}
    <text x="137" y="70" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="800" fill="#fff">${xml(short(school.name.toUpperCase(), 28))}</text>
    <text x="138" y="101" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="800" letter-spacing="2" fill="${accent}">${card.personType === "student" ? "STUDENT IDENTIFICATION CARD" : "STAFF IDENTIFICATION CARD"}</text>
    <rect x="36" y="178" width="225" height="244" rx="18" fill="#f4f7fa" stroke="${accent}" stroke-width="4"/>
    ${portrait}
    <text x="294" y="214" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="800" fill="#0b1724">${xml(short(card.personName, 27))}</text>
    <rect x="294" y="229" width="250" height="6" rx="3" fill="${accent}"/>
    <text x="294" y="269" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="#697586">${card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</text>
    <text x="294" y="306" font-family="Arial,Helvetica,sans-serif" font-size="29" font-weight="800" fill="${primary}">${xml(short(schoolId, 28))}</text>
    <text x="294" y="343" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="#697586">${card.personType === "student" ? "CLASS" : "ROLE / POSITION"}</text>
    <text x="294" y="376" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#263444">${xml(short(role, 31))}</text>
    <text x="294" y="407" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#697586">CARD NO.</text>
    <text x="294" y="431" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="#263444">${xml(short(card.serial, 38))}</text>
    <rect x="36" y="451" width="405" height="61" rx="11" fill="#f5f8fa" stroke="#d8e0e8" stroke-width="2"/>
    <text x="57" y="476" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="1.5" fill="#697586">ISSUED</text>
    <text x="57" y="501" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="800" fill="${primary}">${xml(date(card.issuedAt))}</text>
    <text x="244" y="476" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="1.5" fill="#697586">VALID UNTIL</text>
    <text x="244" y="501" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="800" fill="${primary}">${xml(date(card.expiresAt))}</text>
    <rect x="468" y="461" width="145" height="41" rx="20" fill="${statusFill}" stroke="${statusColor}" stroke-width="2"/>
    <text x="540" y="487" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="${statusColor}">${status}</text>
    <text x="648" y="477" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" letter-spacing="1.4" fill="#697586">OFFICIAL SCHOOL</text>
    <text x="648" y="498" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" fill="${primary}">CREDENTIAL</text>
    <rect x="1" y="1" width="854" height="537.8" rx="25" fill="none" stroke="${primary}" stroke-width="3"/>
  `);
}

function backSvg(card: ArtworkCard, school: ArtworkSchool, verifyUrl: string) {
  const { primary, accent } = brandHex(school.brandColors);
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student"
    ? [card.className, card.houseName].filter(Boolean).join(" · ") || "Not assigned"
    : card.roleName || "Staff member";
  const contactLabel = card.personType === "student" ? "GUARDIAN / EMERGENCY" : "SCHOOL CONTACT";
  const contactName = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contactValue = card.personType === "student" ? (card.guardianPhone || "Contact the school office") : (card.contactEmail || "Staff account");
  const logo = imageOrInitials(school.logoUrl, school.name, 31, 28, 72, 72, "backLogoClip", primary, "contain");
  const qrX = 630;
  const qrY = 177;
  const qrSize = 182;
  return svgShell(`
    <defs><clipPath id="backLogoClip"><rect x="31" y="28" width="72" height="72" rx="12"/></clipPath></defs>
    <rect width="856" height="539.8" rx="26" fill="#ffffff"/>
    ${securityPattern(primary, accent)}
    <rect width="856" height="124" rx="26" fill="${primary}"/>
    <rect y="114" width="856" height="12" fill="${accent}"/>
    <rect x="31" y="28" width="72" height="72" rx="12" fill="#fff" stroke="${accent}" stroke-width="3"/>
    ${logo}
    <text x="126" y="65" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="800" fill="#fff">${xml(short(school.name.toUpperCase(), 30))}</text>
    <text x="127" y="94" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="800" letter-spacing="2" fill="${accent}">SECURE ID · SCAN TO VERIFY</text>
    <text x="45" y="168" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#697586">${card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</text>
    <text x="45" y="201" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="800" fill="${primary}">${xml(short(schoolId, 30))}</text>
    <text x="45" y="245" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#697586">${card.personType === "student" ? "CLASS / HOUSE" : "ROLE"}</text>
    <text x="45" y="276" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700" fill="#263444">${xml(short(roleLine, 34))}</text>
    <text x="45" y="320" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#697586">${contactLabel}</text>
    <text x="45" y="350" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="700" fill="${primary}">${xml(short(contactName, 34))}</text>
    <text x="45" y="378" font-family="Arial,Helvetica,sans-serif" font-size="17" fill="#697586">${xml(short(contactValue, 42))}</text>
    <line x1="45" y1="422" x2="320" y2="422" stroke="#9aa7b4" stroke-width="2"/>
    <text x="45" y="443" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" letter-spacing="1.5" fill="#697586">AUTHORISED SIGNATURE</text>
    <rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" rx="10" fill="#fff" stroke="#d8e0e8" stroke-width="3"/>
    <path d="${qrPath(verifyUrl, qrX, qrY, qrSize)}" fill="${primary}"/>
    <text x="${qrX + qrSize / 2}" y="382" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="900" fill="${primary}">SCAN TO VERIFY</text>
    <text x="${qrX + qrSize / 2}" y="403" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#697586">Live status · expiry · authenticity</text>
    <text x="385" y="446" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="800" fill="${primary}">School code: ${xml(short(school.uniqueCode, 24))}</text>
    <rect x="31" y="467" width="794" height="48" rx="11" fill="#f5f8fa" stroke="#d8e0e8" stroke-width="2"/>
    <text x="48" y="496" font-family="Arial,Helvetica,sans-serif" font-size="15" fill="#344454">If found, return this card to ${xml(short(school.name, 42))}. This is a school credential, not a national identity document.</text>
    <rect x="1" y="1" width="854" height="537.8" rx="25" fill="none" stroke="${primary}" stroke-width="3"/>
  `);
}

export function buildIdentityCardSvg(card: ArtworkCard, school: ArtworkSchool, verifyUrl: string, side: IdentityCardArtworkSide) {
  return side === "back" ? backSvg(card, school, verifyUrl) : frontSvg(card, school);
}

function drawCropMarks(page: PDFPage, x: number, y: number) {
  const color = rgb(.18, .22, .27);
  const length = 5;
  const offset = 3;
  const x2 = x + CARD_WIDTH;
  const y2 = y + CARD_HEIGHT;
  const line = (x1: number, y1: number, xEnd: number, yEnd: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: xEnd, y: yEnd }, thickness: .45, color, opacity: .72 });

  line(x - offset - length, y, x - offset, y);
  line(x, y - offset - length, x, y - offset);
  line(x2 + offset, y, x2 + offset + length, y);
  line(x2, y - offset - length, x2, y - offset);
  line(x - offset - length, y2, x - offset, y2);
  line(x, y2 + offset, x, y2 + offset + length);
  line(x2 + offset, y2, x2 + offset + length, y2);
  line(x2, y2 + offset, x2, y2 + offset + length);
}

function drawRegistrationMark(page: PDFPage, y: number) {
  const x = A4_WIDTH / 2;
  const color = rgb(.42, .46, .5);
  page.drawLine({ start: { x: x - 5, y }, end: { x: x + 5, y }, thickness: .4, color, opacity: .65 });
  page.drawLine({ start: { x, y: y - 5 }, end: { x, y: y + 5 }, thickness: .4, color, opacity: .65 });
}

export async function addBulkIdentityCardCropMarks(pdf: Buffer, cardCount: number) {
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gridWidth = 2 * CARD_WIDTH + BULK_GAP_X;
  const marginX = (A4_WIDTH - gridWidth) / 2;
  const topY = A4_HEIGHT - 48 - CARD_HEIGHT;
  const sheets = Math.ceil(cardCount / 8);

  for (let sheet = 0; sheet < sheets; sheet += 1) {
    const count = Math.min(8, Math.max(0, cardCount - sheet * 8));
    const front = pages[sheet * 2];
    const back = pages[sheet * 2 + 1];
    if (!front || !back) continue;
    for (let index = 0; index < count; index += 1) {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const y = topY - row * (CARD_HEIGHT + BULK_GAP_Y);
      drawCropMarks(front, marginX + column * (CARD_WIDTH + BULK_GAP_X), y);
      drawCropMarks(back, marginX + (1 - column) * (CARD_WIDTH + BULK_GAP_X), y);
    }
    for (const page of [front, back]) {
      drawRegistrationMark(page, A4_HEIGHT - 43);
      drawRegistrationMark(page, 43);
      page.drawText("CUT MARKS · CR80 85.60 × 53.98 mm · PRINT 100% / ACTUAL SIZE", {
        x: 48,
        y: 7,
        size: 4.6,
        font: bold,
        color: rgb(.42, .46, .5),
        maxWidth: A4_WIDTH - 96,
      });
    }
  }

  return Buffer.from(await doc.save());
}
