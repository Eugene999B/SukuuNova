import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createStoreProduct, recordStoreSale } from "../src/lib/school-store-service";
import { createTenantFixture } from "./helpers";

describe("school store governance", () => {
  it("separates cashier sales from discount authority and requires non-cash references", async () => {
    const fixture = await createTenantFixture();

    const variantId = await withTenant(fixture.schoolId, async (tx) => {
      await tx.userPermissionOverride.create({
        data: {
          schoolId: fixture.schoolId,
          userId: fixture.memberId,
          permissionId: fixture.permissionIds.get("store:sell")!,
          granted: true,
        },
      });
      await createStoreProduct(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        name: "Governed Exercise Book",
        sku: "GOV-BOOK",
        variants: [{ sku: "GOV-BOOK-A5", price: 20, openingStock: 4 }],
      });
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "SchoolStoreVariant" WHERE "schoolId"=$1 AND "sku"='GOV-BOOK-A5' LIMIT 1`,
        fixture.schoolId,
      );
      return rows[0].id;
    });

    await expect(withTenant(fixture.schoolId, (tx) => recordStoreSale(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.memberId,
      customerType: "external",
      customerName: "Cash Customer",
      paymentMethod: "Cash",
      discount: 5,
      lines: [{ variantId, quantity: 1 }],
    }))).rejects.toMatchObject({ status: 403 });

    await expect(withTenant(fixture.schoolId, (tx) => recordStoreSale(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      customerType: "external",
      customerName: "MoMo Customer",
      paymentMethod: "Mobile Money",
      lines: [{ variantId, quantity: 1 }],
    }))).rejects.toMatchObject({ code: "PAYMENT_REFERENCE_REQUIRED" });

    await expect(withTenant(fixture.schoolId, (tx) => recordStoreSale(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      customerType: "external",
      customerName: "MoMo Customer",
      paymentMethod: "Mobile Money",
      paymentReference: "MOMO-RECON-001",
      discount: 5,
      lines: [{ variantId, quantity: 1 }],
    }))).resolves.toMatchObject({ total: 15 });
  });
});
