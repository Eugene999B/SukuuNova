export type PasswordPolicyUniverse = "platform" | "school" | "teacher" | "guardian";

export const ACCESSIBLE_PASSWORD_MIN_LENGTH = 6;
export const PRIVILEGED_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export function passwordMinimumForAccount(
  universe: PasswordPolicyUniverse,
  isElevatedSchoolAccount = false,
): number {
  if (universe === "platform") return PRIVILEGED_PASSWORD_MIN_LENGTH;
  if (universe === "school" && isElevatedSchoolAccount) return PRIVILEGED_PASSWORD_MIN_LENGTH;
  return ACCESSIBLE_PASSWORD_MIN_LENGTH;
}

export function passwordLengthError(password: string, minimum: number): string | null {
  if (password.length < minimum || password.length > PASSWORD_MAX_LENGTH) {
    return `New password must contain ${minimum}–${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}
