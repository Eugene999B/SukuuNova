export const GENDER_VALUES = ["male", "female", "other", "prefer_not_to_say"] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

export function normalizeGender(value: unknown): GenderValue | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (["male", "m", "boy", "man"].includes(raw)) return "male";
  if (["female", "f", "girl", "woman"].includes(raw)) return "female";
  if (["other"].includes(raw)) return "other";
  if (["prefer_not_to_say", "prefer not to say", "prefer-not-to-say", "undisclosed"].includes(raw)) return "prefer_not_to_say";
  return null;
}

export function genderLabel(value: unknown) {
  const gender = normalizeGender(value);
  if (gender === "male") return "Male";
  if (gender === "female") return "Female";
  if (gender === "other") return "Other";
  if (gender === "prefer_not_to_say") return "Prefer not to say";
  return "Not recorded";
}

export function genderAnalyticsBucket(value: unknown): "male" | "female" | "other_or_undisclosed" | "not_recorded" {
  const gender = normalizeGender(value);
  if (gender === "male" || gender === "female") return gender;
  if (gender === "other" || gender === "prefer_not_to_say") return "other_or_undisclosed";
  return "not_recorded";
}
