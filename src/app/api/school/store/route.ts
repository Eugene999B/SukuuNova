import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { readBoundedJson } from "@/lib/bounded-json";
import { createStoreProduct, recordStoreSale, restockStoreVariant, schoolStoreWorkspace, updateStoreVariant, voidStoreSale } from "@/lib/school-store-service";

const optionalText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();
const variantSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  size: optionalText(60),
  color: optionalText(60),
  barcode: optionalText(120),
  price: z.coerce.number().min(0).max(1_000_000_000),
  costPrice: z.union([z.coerce.number().min(0).max(1_000_000_000), z.null()]).optional(),
  openingStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).optional(),
}).strict();

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createProduct"), name: z.string().trim().min(1).max(160), sku: z.string().trim().min(1).max(60), category: optionalText(100), description: optionalText(800), variants: z.array(variantSchema).min(1).max(40) }).strict(),
  z.object({ action: z.literal("restock"), variantId: z.string().min(1).max(160), quantity: z.coerce.number().int().min(1).max(1_000_000), unitCost: z.union([z.coerce.number().min(0).max(1_000_000_000), z.null()]).optional(), notes: optionalText(500) }).strict(),
  z.object({ action: z.literal("updateVariant"), variantId: z.string().min(1).max(160), price: z.coerce.number().min(0).max(1_000_000_000), reorderLevel: z.coerce.number().int().min(0).max(1_000_000), size: optionalText(60), color: optionalText(60) }).strict(),
  z.object({ action: z.literal("sale"), customerType: z.enum(["student","guardian","external"]), studentId: optionalText(160), guardianId: optionalText(160), customerName: optionalText(160), customerPhone: optionalText(50), paymentMethod: z.string().trim().min(1).max(40), paymentReference: optionalText(120), discount: z.coerce.number().min(0).max(1_000_000_000).optional(), notes: optionalText(500), lines: z.array(z.object({ variantId: z.string().min(1).max(160), quantity: z.coerce.number().int().min(1).max(10_000) }).strict()).min(1).max(60) }).strict(),
  z.object({ action: z.literal("voidSale"), saleId: z.string().min(1).max(160), reason: z.string().trim().min(3).max(500) }).strict(),
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, (tx) => schoolStoreWorkspace(tx, session.schoolId, session.userId));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const parsed = bodySchema.parse(await readBoundedJson(request, 96 * 1024, "School store request"));
    const result = await withTenant(session.schoolId, async (tx) => {
      if (parsed.action === "createProduct") return createStoreProduct(tx, { schoolId: session.schoolId, actorId: session.userId, ...parsed });
      if (parsed.action === "restock") return restockStoreVariant(tx, { schoolId: session.schoolId, actorId: session.userId, ...parsed });
      if (parsed.action === "updateVariant") return updateStoreVariant(tx, { schoolId: session.schoolId, actorId: session.userId, ...parsed });
      if (parsed.action === "sale") return recordStoreSale(tx, { schoolId: session.schoolId, actorId: session.userId, ...parsed });
      return voidStoreSale(tx, { schoolId: session.schoolId, actorId: session.userId, saleId: parsed.saleId, reason: parsed.reason });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
