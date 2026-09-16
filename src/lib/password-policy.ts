export type PasswordPolicyUniverse = "platform" | "school" | "teacher" | "guardian";

export const ACCESSIBLE_PASSWORD_MIN_LENGTH = 6;
export const PRIVILEGED_PASSWORD_MIN_LENGTH = ACCESSIBLE_PASSWORD_MIN_LENGTH;
export const PASSWORD_MAX_LENGTH = 256;

export function passwordMinimumForAccount(
  _universe: PasswordPolicyUniverse,
  _isElevatedSchoolAccount = false,
): number {
  return ACCESSIBLE_PASSWORD_MIN_LENGTH;
}

export function passwordLengthError(password: string, minimum: number): string | null {
  if (password.length < minimum || password.length > PASSWORD_MAX_LENGTH) {
    return `New password must contain ${minimum}–${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}
