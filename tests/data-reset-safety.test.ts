import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  APPLICATION_TABLE_EXCLUSION,
  EXECUTE_CONFIRMATION,
  parseResetTarget,
  quotePgIdentifier,
  assertResetAuthorization,
  safeDatabaseSummary,
} = require("../scripts/data-reset-safety.cjs") as {
  APPLICATION_TABLE_EXCLUSION: string;
  EXECUTE_CONFIRMATION: string;
  parseResetTarget: (rawUrl: string) => { url: string; host: string; port: string | null; name: string };
  quotePgIdentifier: (value: string) => string;
  assertResetAuthorization: (input: {
    mode: string;
    databaseName: string;
    allowValue?: string;
    confirmDatabaseName?: string;
  }) => { mode: "preview" | "execute"; authorized: boolean };
  safeDatabaseSummary: (target: { host: string; port: string | null; name: string }) => Record<string, string>;
};

describe("application data reset safety", () => {
  it("allows a non-destructive preview without the destructive confirmation", () => {
    const target = parseResetTarget("postgresql://operator:secret@db.example.com:5432/sukuunova_trial?sslmode=require");
    expect(assertResetAuthorization({ mode: "preview", databaseName: target.name })).toEqual({
      mode: "preview",
      authorized: false,
    });
  });

  it("rejects execute mode without the exact allow phrase", () => {
    expect(() => assertResetAuthorization({
      mode: "execute",
      databaseName: "sukuunova_trial",
      allowValue: "YES",
      confirmDatabaseName: "sukuunova_trial",
    })).toThrow(/YES_DELETE_APPLICATION_DATA/);
  });

  it("requires exact database-name confirmation for execute mode", () => {
    expect(() => assertResetAuthorization({
      mode: "execute",
      databaseName: "sukuunova_trial",
      allowValue: EXECUTE_CONFIRMATION,
      confirmDatabaseName: "sukuunova_prod",
    })).toThrow(/exactly match/);

    expect(assertResetAuthorization({
      mode: "execute",
      databaseName: "sukuunova_trial",
      allowValue: EXECUTE_CONFIRMATION,
      confirmDatabaseName: "sukuunova_trial",
    })).toEqual({ mode: "execute", authorized: true });
  });

  it.each(["postgres", "template0", "template1"])("refuses PostgreSQL system database %s", (name) => {
    expect(() => parseResetTarget(`postgresql://operator:secret@localhost:5432/${name}`)).toThrow(/system database/);
  });

  it("quotes PostgreSQL identifiers safely", () => {
    expect(quotePgIdentifier('foo"bar')).toBe('"foo""bar"');
  });

  it("returns a safe target summary without credentials or query parameters", () => {
    const target = parseResetTarget("postgresql://operator:super-secret@db.example.com:6543/sukuunova_trial?sslmode=require");
    const summary = safeDatabaseSummary(target);
    expect(summary).toEqual({ host: "db.example.com", port: "6543", name: "sukuunova_trial" });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("operator");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("sslmode");
  });

  it("preserves Prisma migration history as the only reset exclusion", () => {
    expect(APPLICATION_TABLE_EXCLUSION).toBe("_prisma_migrations");
  });
});
