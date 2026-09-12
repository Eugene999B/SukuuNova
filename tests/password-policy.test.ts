import { describe, expect, it } from "vitest";
import {
  ACCESSIBLE_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PRIVILEGED_PASSWORD_MIN_LENGTH,
  passwordLengthError,
  passwordMinimumForAccount,
} from "../src/lib/password-policy";

describe("password policy", () => {
  it("allows six-character minimums for guardians, teachers, and ordinary school staff", () => {
    expect(passwordMinimumForAccount("guardian")).toBe(ACCESSIBLE_PASSWORD_MIN_LENGTH);
    expect(passwordMinimumForAccount("teacher")).toBe(ACCESSIBLE_PASSWORD_MIN_LENGTH);
    expect(passwordMinimumForAccount("school", false)).toBe(ACCESSIBLE_PASSWORD_MIN_LENGTH);
    expect(passwordLengthError("123456", ACCESSIBLE_PASSWORD_MIN_LENGTH)).toBeNull();
    expect(passwordLengthError("12345", ACCESSIBLE_PASSWORD_MIN_LENGTH)).toBe(
      `New password must contain ${ACCESSIBLE_PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`,
    );
  });

  it("keeps privileged school and platform accounts at twelve characters", () => {
    expect(passwordMinimumForAccount("school", true)).toBe(PRIVILEGED_PASSWORD_MIN_LENGTH);
    expect(passwordMinimumForAccount("platform")).toBe(PRIVILEGED_PASSWORD_MIN_LENGTH);
    expect(passwordLengthError("123456789012", PRIVILEGED_PASSWORD_MIN_LENGTH)).toBeNull();
    expect(passwordLengthError("12345678901", PRIVILEGED_PASSWORD_MIN_LENGTH)).toBe(
      `New password must contain ${PRIVILEGED_PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`,
    );
  });

  it("rejects passwords longer than the existing maximum", () => {
    expect(passwordLengthError("x".repeat(PASSWORD_MAX_LENGTH + 1), ACCESSIBLE_PASSWORD_MIN_LENGTH)).toBe(
      `New password must contain ${ACCESSIBLE_PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`,
    );
  });
});
