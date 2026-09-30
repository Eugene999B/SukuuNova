import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

const current = "middleware-current-test-secret-0000000000";
const previous = "middleware-previous-test-secret-000000000";
type Kind = "school" | "platform" | "guardian";
async function token(kind: Kind, key = current, expired = false) {
  return new SignJWT({ kind }).setProtectedHeader({ alg: "HS256" })
    .setSubject("isolated-test-user").setIssuer("sukuunova-" + kind)
    .setAudience("sukuunova-" + kind).setExpirationTime(expired ? 0 : "1h")
    .sign(new TextEncoder().encode(key));
}
async function request(path: string, kind: Kind, value: string, method = "GET") {
  return middleware(new NextRequest("https://example.invalid" + path, {
    method, headers: { cookie: "sukuunova_" + kind + "_session=" + value },
  }));
}
describe("session middleware boundaries", () => {
  beforeEach(() => {
    for (const name of ["SCHOOL", "PLATFORM", "GUARDIAN"]) {
      vi.stubEnv(name + "_AUTH_SECRET", current);
      vi.stubEnv(name + "_AUTH_SECRET_PREVIOUS", previous);
    }
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["school", "/api/school/access"],
    ["platform", "/api/platform/schools"],
    ["guardian", "/guardian"],
  ] as const)("accepts current and configured previous %s keys", async (kind, path) => {
    for (const key of [current, previous]) {
      expect((await request(path, kind, await token(kind, key))).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("lets guardians reach only GET report PDF authorization", async () => {
    const session = await token("guardian");
    expect((await request("/api/mvp/report-cards/report-1/pdf?download=1", "guardian", session)).headers.get("x-middleware-next")).toBe("1");
    for (const path of ["/api/mvp/report-cards", "/api/school/access", "/api/platform/schools", "/api/mvp/report-cards/report-1/pdf/other"]) {
      expect((await request(path, "guardian", session)).status).toBe(401);
    }
    expect((await request("/api/mvp/report-cards/report-1/pdf", "guardian", session, "POST")).status).toBe(401);
  });

  it("denies expired, foreign-signed and wrong-universe sessions", async () => {
    for (const session of [await token("guardian", current, true), await token("guardian", "unconfigured-test-key-000000000000000000"), await token("platform")]) {
      expect((await request("/api/mvp/report-cards/report-1/pdf", "guardian", session)).status).toBe(401);
    }
    expect((await request("/api/platform/schools", "school", await token("school"))).status).toBe(401);
  });

  it("does not use a previous key when the current key is unconfigured", async () => {
    vi.stubEnv("GUARDIAN_AUTH_SECRET", "");
    expect((await request("/api/mvp/report-cards/report-1/pdf", "guardian", await token("guardian", previous))).status).toBe(401);
  });
});
