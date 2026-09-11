import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../src/lib/default-rbac";

const root = path.resolve(process.cwd());
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("school store and property operational contracts", () => {
  it("keeps store and property permissions in canonical RBAC with Owner authority", () => {
    const required = [
      "store:view","store:manage_catalog","store:stock","store:sell","store:void_sale","store:export",
      "properties:view","properties:manage","properties:move","properties:dispose","properties:export",
    ] as const;
    for (const key of required) {
      expect(DEFAULT_PERMISSIONS).toContain(key);
      expect(DEFAULT_ROLE_PERMISSIONS.Owner).toContain(key);
      expect(DEFAULT_ROLE_PERMISSIONS.Principal).toContain(key);
      expect(DEFAULT_ROLE_PERMISSIONS.Administrator).toContain(key);
    }
    expect(DEFAULT_ROLE_PERMISSIONS.Accountant).toContain("store:sell");
    expect(DEFAULT_ROLE_PERMISSIONS.Accountant).not.toContain("store:void_sale");
    expect(DEFAULT_ROLE_PERMISSIONS["Vice Principal"]).toContain("properties:view");
    expect(DEFAULT_ROLE_PERMISSIONS["Vice Principal"]).not.toContain("properties:dispose");
  });

  it("creates separate tenant-isolated registers for retail stock and owned property", () => {
    const migration = source("prisma/migrations/20260911110000_school_store_properties/migration.sql");
    for (const table of ["SchoolStoreProduct","SchoolStoreVariant","SchoolStoreSale","SchoolStoreSaleLine","SchoolStoreStockMovement","SchoolPropertyLocation","SchoolPropertyItem","SchoolPropertyHolding","SchoolPropertyMovement"]) {
      expect(migration).toContain(`CREATE TABLE \"${table}\"`);
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("app.current_school_id");
    expect(migration).toContain("SchoolStoreSale_customer_type_check");
    expect(migration).toContain("SchoolPropertyMovement_action_check");
  });

  it("bounds and strictly validates store and property mutations before domain writes", () => {
    const store = source("src/app/api/school/store/route.ts");
    const properties = source("src/app/api/school/properties/route.ts");
    const bounded = source("src/lib/bounded-json.ts");
    for (const route of [store, properties]) {
      expect(route).toContain("readBoundedJson");
      expect(route).toContain("z.discriminatedUnion");
      expect(route).not.toContain("request.json()");
    }
    expect(bounded).toContain("request.body.getReader()");
    expect(bounded).toContain("BODY_TOO_LARGE");
  });

  it("keeps store pricing and stock server-authoritative with reversible audit history", () => {
    const service = source("src/lib/school-store-service.ts");
    expect(service).toContain("FOR UPDATE OF v");
    expect(service).toContain("INSUFFICIENT_STOCK");
    expect(service).toContain('movementType\",\"quantityDelta\"');
    expect(service).toContain("store.sale_completed");
    expect(service).toContain("store.sale_voided");
    expect(service).toContain("stockQuantity\"=\"stockQuantity\"+");
    expect(service).toContain('requireStore(tx, input.actorId, "store:void_sale")');
  });

  it("keeps destructive property outcomes behind a separate high-impact permission", () => {
    const service = source("src/lib/school-properties-service.ts");
    expect(service).toContain('["lost","destroyed","disposed"].includes(input.outcome)');
    expect(service).toContain('destructive ? "properties:dispose" : "properties:move"');
    expect(service).toContain("SERIAL_SPLIT_NOT_ALLOWED");
    expect(service).toContain("SchoolPropertyMovement");
  });

  it("protects spreadsheet exports from formula injection", () => {
    const exporter = source("src/lib/office-export.ts");
    expect(exporter).toContain("spreadsheetSafe");
    expect(exporter).toContain("/^[=+\\-@\\t\\r]/");
    expect(exporter).toContain("x-content-type-options");
    expect(source("src/app/api/school/store/export/route.ts")).toContain("schoolStoreExportRows");
    expect(source("src/app/api/school/properties/export/route.ts")).toContain("schoolPropertyExportRows");
  });

  it("makes both modules discoverable and retires the ambiguous legacy inventory route", () => {
    const shell = source("src/components/AppShell.tsx");
    const legacy = source("src/app/school/inventory/page.tsx");
    expect(shell).toContain('label: "School Store", href: "/school/store"');
    expect(shell).toContain('label: "School Properties", href: "/school/properties"');
    expect(legacy).toContain('redirect("/school/properties")');
  });

  it("keeps Eugene Academy current in both trial and production showcase pipelines", () => {
    const trial = source("scripts/run-eugene-academy-showcase.cjs");
    const production = source("scripts/seed-eugene-academy-production-showcase.cjs");
    const fixture = source("scripts/seed-eugene-academy-store-properties.cjs");
    expect(trial).toContain("seed-eugene-academy-store-properties.cjs");
    expect(trial).toContain('EUGENE_ACADEMY_OPERATIONS_TARGET: "trial"');
    expect(production).toContain("seed-eugene-academy-store-properties.cjs");
    expect(production).toContain('EUGENE_ACADEMY_OPERATIONS_TARGET: "production"');
    expect(fixture).toContain("Eugene Academy Polo Shirt");
    expect(fixture).toContain("Science Laboratory");
    expect(fixture).toContain("Class 1B");
  });
});
