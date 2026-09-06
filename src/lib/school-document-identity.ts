export type SchoolDocumentIdentity = {
  name: string;
  uniqueCode: string;
  logoUrl: string | null;
  primary: string;
  accent: string;
  watermark: string;
};

function validHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function getSchoolDocumentIdentity(input: {
  name: string;
  uniqueCode: string;
  logoUrl?: string | null;
  brandColors?: unknown;
  watermark?: string | null;
}): SchoolDocumentIdentity {
  const brand = input.brandColors && typeof input.brandColors === "object" && !Array.isArray(input.brandColors)
    ? input.brandColors as Record<string, unknown>
    : {};

  return {
    name: input.name,
    uniqueCode: input.uniqueCode,
    logoUrl: input.logoUrl ?? null,
    primary: validHex(brand.primary) ? brand.primary : "#164e63",
    accent: validHex(brand.accent) ? brand.accent : "#dcefeb",
    watermark: typeof input.watermark === "string" && input.watermark.trim()
      ? input.watermark.trim()
      : "SUKUUNOVA"
  };
}
