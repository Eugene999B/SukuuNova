import { describe, expect, it } from "vitest";
import {
  ACCESSIBLE_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PRIVILEGED_PASSWORD_MIN_LENGTH,
  passwordLengthError,
  passwordMinimumForAccount,
} from "../src/lib/password-policy";

describe("password policy", () => {
  it("uses a six-character minimum for every account type", () => {
    expect(ACCESSIBLE_PASSWORD_MIN_LENGTH).toBe(6);
    expect(PRIVILEGED_PASSWORD_MIN_LENGTH).toBe(6);
    expect(passwordMinimumForAccount("guardian")).toBe(6);
    expect(passwordMinimumForAccount("teacher")).toBe(6);
    expect(passwordMinimumForAccount("school", false)).toBe(6);
    expect(passwordMinimumForAccount("school", true)).toBe(6);
    expect(passwordMinimumForAccount("platform")).toBe(6);
    expect(passwordLengthError("123456", 6)).toBeNull();
    expect(passwordLengthError("12345", 6)).toBe(
      `New password must contain 6–${PASSWORD_MAX_LENGTH} characters.`,
    );
  });

  it("does not impose character-type complexity rules", () => {
    expect(passwordLengthError("aaaaaa", 6)).toBeNull();
    expect(passwordLengthError("123456", 6)).toBeNull();
    expect(passwordLengthError("!!!!!!", 6)).toBeNull();
  });

  it("rejects passwords longer than the existing maximum", () => {
    expect(passwordLengthError("x".repeat(PASSWORD_MAX_LENGTH + 1), 6)).toBe(
      `New password must contain 6–${PASSWORD_MAX_LENGTH} characters.`,
    );
  });
});
