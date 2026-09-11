import { describe, expect, it } from "vitest";
import { identityCardPublicOrigin } from "../src/lib/identity-card-public-origin";

function env(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return {
    NODE_ENV: "production",
    APP_URL: undefined,
    NEXT_PUBLIC_APP_URL: undefined,
    RAILWAY_PUBLIC_DOMAIN: undefined,
    ...overrides,
  };
}

describe("identity-card public verification origin", () => {
  it("uses APP_URL instead of an internal reverse-proxy request host", () => {
    expect(identityCardPublicOrigin(
      "http://sukuunova.railway.internal:8080/api/school/identity-cards",
      env({ APP_URL: "https://sukuunova-production.up.railway.app/school/id-cards" }),
    )).toBe("https://sukuunova-production.up.railway.app");
  });

  it("falls back to NEXT_PUBLIC_APP_URL and then Railway's public domain", () => {
    expect(identityCardPublicOrigin(
      "http://127.0.0.1:3000/api/school/identity-cards",
      env({ NEXT_PUBLIC_APP_URL: "https://school.example.com" }),
    )).toBe("https://school.example.com");

    expect(identityCardPublicOrigin(
      "http://127.0.0.1:3000/api/school/identity-cards",
      env({ RAILWAY_PUBLIC_DOMAIN: "sukuunova-production.up.railway.app" }),
    )).toBe("https://sukuunova-production.up.railway.app");
  });

  it("never prints an internal or insecure production origin", () => {
    expect(() => identityCardPublicOrigin(
      "http://127.0.0.1:3000/api/school/identity-cards",
      env(),
    )).toThrowError(/public APP_URL or NEXT_PUBLIC_APP_URL/i);

    expect(() => identityCardPublicOrigin(
      "https://public.example.com/api/school/identity-cards",
      env({ APP_URL: "http://localhost:3000" }),
    )).toThrowError(/not configured safely/i);
  });

  it("permits request-origin fallback outside production for local development", () => {
    expect(identityCardPublicOrigin(
      "http://localhost:3000/api/school/identity-cards",
      env({ NODE_ENV: "test" }),
    )).toBe("http://localhost:3000");
  });
});
