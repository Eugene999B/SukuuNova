import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { hasPermission } from "./rbac";

type StoreVariantInput = {
  sku: string;
  size?: string | null;
  color?: string | null;
  barcode?: string | null;
  price: number;
  costPrice?: number | null;
  openingStock?: number;
  reorderLevel?: number;
};

type SaleLineInput = { variantId: string; quantity: number };

type StoreRow = Record<string, unknown>;

const STORE_PAYMENT_METHODS = new Set(["Cash", "Mobile Money", "Bank Transfer", "POS / Card", "Cheque", "Other"]);

function money(value: number) { return Math.round(value * 100) / 100; }
function text(value: unknown, max: number, field: string) {
  const next = String(value ?? "").trim();
  if (!next || next.length > max) throw new AppError(`${field} is invalid.`, 400, "INVALID_INPUT");
  return next;
}
function optionalText(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const next = String(value).trim();
  if (next.length > max) throw new AppError("A supplied text field is too long.", 400, "INVALID_INPUT");
  return next || null;
}
async function requireStore(tx: TenantDb, actorId: string, permission: string) {
  if (!(await hasPermission(tx, actorId, permission))) throw new ForbiddenError(`Missing required permission: ${permission}`);
}

export async function schoolStoreAccess(tx: TenantDb, actorId: string) {
  const keys = ["store:view","store:manage_catalog","store:stock","store:sell","store:discount","store:void_sale","store:export"] as const;
  const values = await Promise.all(keys.map((key) => hasPermission(tx, actorId, key)));
  return Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Record<(typeof keys)[number], boolean>;
}

export async function schoolStoreWorkspace(tx: TenantDb, schoolId: string, actorId: string) {
  const access = await schoolStoreAccess(tx, actorId);
  if (!access["store:view"]) throw new ForbiddenError("You do not have access to the school store.");

  const [products, variants, sales, topProducts, stockSummary, todaySummary, students, guardians] = await Promise.all([
    tx.$queryRawUnsafe<StoreRow[]>(`SELECT "id","name","sku","category","description","status","createdAt","updatedAt" FROM "SchoolStoreProduct" WHERE "schoolId"=$1 ORDER BY "name"`, schoolId),
    tx.$queryRawUnsafe<StoreRow[]>(`SELECT "id","productId","sku","size","color","barcode","price","costPrice","stockQuantity","reorderLevel","status","createdAt","updatedAt" FROM "SchoolStoreVariant" WHERE "schoolId"=$1 ORDER BY "productId","size" NULLS FIRST,"color" NULLS FIRST`, schoolId),
    tx.$queryRawUnsafe<StoreRow[]>(`SELECT "id","receiptNo","customerType","studentId","guardianId","customerName","customerPhone","paymentMethod","paymentReference","subtotal","discount","total","status","createdBy","createdAt","voidedAt","voidReason" FROM "SchoolStoreSale" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC LIMIT 250`, schoolId),
    tx.$queryRawUnsafe<StoreRow[]>(`SELECT l."productName",SUM(l."quantity")::int AS "units",SUM(l."lineTotal")::numeric AS "value" FROM "SchoolStoreSaleLine" l JOIN "SchoolStoreSale" s ON s."id"=l."saleId" AND s."schoolId"=l."schoolId" WHERE l."schoolId"=$1 AND s."status"='completed' AND s."createdAt">=CURRENT_TIMESTAMP-INTERVAL '30 days' GROUP BY l."productName" ORDER BY "units" DESC LIMIT 6`, schoolId),
    tx.$queryRawUnsafe<StoreRow[]>(`SELECT COALESCE(SUM("stockQuantity"),0)::int AS "units",COUNT(*) FILTER (WHERE "status"='active' AND "stockQuantity"<="reorderLevel")::int AS "lowStock",COALESCE(SUM("stockQuantity"*COALESCE("costPrice","price")),0)::numeric AS "stockValue" FROM "SchoolStoreVariant" WHERE "schoolId"=$1 AND "status"='active'`, schoolId),
    tx.$queryRawUnsafe<StoreRow[]>(`SELECT COUNT(*) FILTER (WHERE "status"='completed')::int AS "transactions",COALESCE(SUM("total") FILTER (WHERE "status"='completed'),0)::numeric AS "sales" FROM "SchoolStoreSale" WHERE "schoolId"=$1 AND "createdAt">=date_trunc('day',CURRENT_TIMESTAMP)`, schoolId),
    tx.student.findMany({ where: { schoolId, status: "active" }, orderBy: { name: "asc" }, take: 1500, select: { id: true, name: true, admissionNo: true, class: { select: { name: true } } } }),
    tx.guardian.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 1500, select: { id: true, name: true, phone: true, email: true } }),
  ]);

  const byProduct = new Map<string, StoreRow[]>();
  for (const variant of variants) {
    const key = String(variant.productId);
    const bucket = byProduct.get(key) ?? [];
    bucket.push({ ...variant, price: Number(variant.price), costPrice: variant.costPrice === null ? null : Number(variant.costPrice) });
    byProduct.set(key, bucket);
  }

  return {
    access,
    products: products.map((product) => ({ ...product, variants: byProduct.get(String(product.id)) ?? [] })),
    sales: sales.map((sale) => ({ ...sale, subtotal: Number(sale.subtotal), discount: Number(sale.discount), total: Number(sale.total) })),
    topProducts: topProducts.map((row) => ({ ...row, value: Number(row.value) })),
    metrics: {
      units: Number(stockSummary[0]?.units ?? 0),
      lowStock: Number(stockSummary[0]?.lowStock ?? 0),
      stockValue: Number(stockSummary[0]?.stockValue ?? 0),
      todayTransactions: Number(todaySummary[0]?.transactions ?? 0),
      todaySales: Number(todaySummary[0]?.sales ?? 0),
    },
    students,
    guardians,
  };
}

export async function createStoreProduct(tx: TenantDb, input: {
  schoolId: string; actorId: string; name: string; sku: string; category?: string | null; description?: string | null; variants: StoreVariantInput[];
}) {
  await requireStore(tx, input.actorId, "store:manage_catalog");
  const name = text(input.name, 160, "Product name");
  const sku = text(input.sku, 60, "Product SKU").toUpperCase();
  const category = optionalText(input.category, 100);
  const description = optionalText(input.description, 800);
  if (!input.variants.length || input.variants.length > 40) throw new AppError("Add between 1 and 40 product variants.", 400, "INVALID_INPUT");
  const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SchoolStoreProduct" WHERE "schoolId"=$1 AND upper("sku")=upper($2) LIMIT 1`, input.schoolId, sku);
  if (existing.length) throw new AppError("A store product already uses this SKU.", 409, "DUPLICATE_SKU");

  const normalized = input.variants.map((variant) => ({
    sku: text(variant.sku, 80, "Variant SKU").toUpperCase(),
    size: optionalText(variant.size, 60),
    color: optionalText(variant.color, 60),
    barcode: optionalText(variant.barcode, 120),
    price: money(Number(variant.price)),
    costPrice: variant.costPrice === null || variant.costPrice === undefined ? null : money(Number(variant.costPrice)),
    openingStock: Math.trunc(Number(variant.openingStock ?? 0)),
    reorderLevel: Math.trunc(Number(variant.reorderLevel ?? 0)),
  }));
  if (new Set(normalized.map((variant) => variant.sku)).size !== normalized.length) throw new AppError("Variant SKUs must be unique within the product.", 400, "DUPLICATE_SKU");
  for (const variant of normalized) {
    if (!Number.isFinite(variant.price) || variant.price < 0 || variant.price > 1_000_000_000) throw new AppError("Variant price is invalid.", 400, "INVALID_INPUT");
    if (variant.costPrice !== null && (!Number.isFinite(variant.costPrice) || variant.costPrice < 0 || variant.costPrice > 1_000_000_000)) throw new AppError("Variant cost price is invalid.", 400, "INVALID_INPUT");
    if (!Number.isInteger(variant.openingStock) || variant.openingStock < 0 || variant.openingStock > 1_000_000) throw new AppError("Opening stock is invalid.", 400, "INVALID_INPUT");
    if (!Number.isInteger(variant.reorderLevel) || variant.reorderLevel < 0 || variant.reorderLevel > 1_000_000) throw new AppError("Reorder level is invalid.", 400, "INVALID_INPUT");
  }
  const duplicateVariant = await tx.$queryRawUnsafe<Array<{ sku: string }>>(`SELECT "sku" FROM "SchoolStoreVariant" WHERE "schoolId"=$1 AND upper("sku")=ANY($2::text[]) LIMIT 1`, input.schoolId, normalized.map((variant) => variant.sku.toUpperCase()));
  if (duplicateVariant.length) throw new AppError(`Variant SKU ${duplicateVariant[0].sku} is already in use.`, 409, "DUPLICATE_SKU");

  const productId = createId();
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreProduct" ("id","schoolId","name","sku","category","description") VALUES ($1,$2,$3,$4,$5,$6)`, productId, input.schoolId, name, sku, category, description);
  for (const variant of normalized) {
    const variantId = createId();
    await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreVariant" ("id","schoolId","productId","sku","size","color","barcode","price","costPrice","stockQuantity","reorderLevel") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, variantId, input.schoolId, productId, variant.sku, variant.size, variant.color, variant.barcode, variant.price, variant.costPrice, variant.openingStock, variant.reorderLevel);
    if (variant.openingStock > 0) {
      await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreStockMovement" ("id","schoolId","variantId","movementType","quantityDelta","referenceType","referenceId","unitCost","notes","createdBy") VALUES ($1,$2,$3,'opening',$4,'product',$5,$6,'Opening stock',$7)`, createId(), input.schoolId, variantId, variant.openingStock, productId, variant.costPrice, input.actorId);
    }
  }
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "store.product_created", entityType: "SchoolStoreProduct", entityId: productId, after: { name, sku, category, variants: normalized.map((variant) => ({ sku: variant.sku, size: variant.size, color: variant.color, openingStock: variant.openingStock })) } });
  return { productId };
}

export async function restockStoreVariant(tx: TenantDb, input: { schoolId: string; actorId: string; variantId: string; quantity: number; unitCost?: number | null; notes?: string | null }) {
  await requireStore(tx, input.actorId, "store:stock");
  const quantity = Math.trunc(Number(input.quantity));
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) throw new AppError("Restock quantity is invalid.", 400, "INVALID_INPUT");
  const unitCost = input.unitCost === null || input.unitCost === undefined ? null : money(Number(input.unitCost));
  if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000_000)) throw new AppError("Unit cost is invalid.", 400, "INVALID_INPUT");
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; stockQuantity: number }>>(`SELECT "id","stockQuantity" FROM "SchoolStoreVariant" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active' FOR UPDATE`, input.schoolId, input.variantId);
  if (!rows[0]) throw new AppError("Store variant not found.", 404, "NOT_FOUND");
  await tx.$executeRawUnsafe(`UPDATE "SchoolStoreVariant" SET "stockQuantity"="stockQuantity"+$3,"costPrice"=COALESCE($4,"costPrice"),"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.variantId, quantity, unitCost);
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreStockMovement" ("id","schoolId","variantId","movementType","quantityDelta","referenceType","unitCost","notes","createdBy") VALUES ($1,$2,$3,'restock',$4,'restock',$5,$6,$7)`, createId(), input.schoolId, input.variantId, quantity, unitCost, optionalText(input.notes, 500), input.actorId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "store.stock_restocked", entityType: "SchoolStoreVariant", entityId: input.variantId, before: { stockQuantity: rows[0].stockQuantity }, after: { stockQuantity: rows[0].stockQuantity + quantity, quantity } });
  return { variantId: input.variantId, stockQuantity: rows[0].stockQuantity + quantity };
}

export async function updateStoreVariant(tx: TenantDb, input: { schoolId: string; actorId: string; variantId: string; price: number; reorderLevel: number; size?: string | null; color?: string | null }) {
  await requireStore(tx, input.actorId, "store:manage_catalog");
  const price = money(Number(input.price));
  const reorderLevel = Math.trunc(Number(input.reorderLevel));
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) throw new AppError("Price is invalid.", 400, "INVALID_INPUT");
  if (!Number.isInteger(reorderLevel) || reorderLevel < 0 || reorderLevel > 1_000_000) throw new AppError("Reorder level is invalid.", 400, "INVALID_INPUT");
  const before = await tx.$queryRawUnsafe<StoreRow[]>(`SELECT "price","reorderLevel","size","color" FROM "SchoolStoreVariant" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, input.schoolId, input.variantId);
  if (!before[0]) throw new AppError("Store variant not found.", 404, "NOT_FOUND");
  await tx.$executeRawUnsafe(`UPDATE "SchoolStoreVariant" SET "price"=$3,"reorderLevel"=$4,"size"=$5,"color"=$6,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.variantId, price, reorderLevel, optionalText(input.size, 60), optionalText(input.color, 60));
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "store.variant_updated", entityType: "SchoolStoreVariant", entityId: input.variantId, before: before[0], after: { price, reorderLevel, size: input.size ?? null, color: input.color ?? null } });
  return { variantId: input.variantId };
}

export async function recordStoreSale(tx: TenantDb, input: {
  schoolId: string; actorId: string; customerType: "student" | "guardian" | "external"; studentId?: string | null; guardianId?: string | null; customerName?: string | null; customerPhone?: string | null; paymentMethod: string; paymentReference?: string | null; discount?: number; notes?: string | null; lines: SaleLineInput[];
}) {
  await requireStore(tx, input.actorId, "store:sell");
  if (!input.lines.length || input.lines.length > 60) throw new AppError("A sale needs between 1 and 60 line items.", 400, "INVALID_INPUT");
  const quantityByVariant = new Map<string, number>();
  for (const line of input.lines) {
    const quantity = Math.trunc(Number(line.quantity));
    if (!line.variantId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10_000) throw new AppError("A sale line is invalid.", 400, "INVALID_INPUT");
    quantityByVariant.set(line.variantId, (quantityByVariant.get(line.variantId) ?? 0) + quantity);
  }
  const ids = [...quantityByVariant.keys()];
  const variants = await tx.$queryRawUnsafe<Array<{ id: string; productId: string; sku: string; size: string | null; color: string | null; price: unknown; stockQuantity: number; productName: string; productStatus: string; variantStatus: string }>>(
    `SELECT v."id",v."productId",v."sku",v."size",v."color",v."price",v."stockQuantity",p."name" AS "productName",p."status" AS "productStatus",v."status" AS "variantStatus" FROM "SchoolStoreVariant" v JOIN "SchoolStoreProduct" p ON p."id"=v."productId" AND p."schoolId"=v."schoolId" WHERE v."schoolId"=$1 AND v."id"=ANY($2::text[]) FOR UPDATE OF v`,
    input.schoolId,
    ids,
  );
  if (variants.length !== ids.length) throw new AppError("One or more sale items no longer exist.", 409, "STORE_ITEM_CHANGED");
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  for (const [variantId, quantity] of quantityByVariant) {
    const variant = variantMap.get(variantId)!;
    if (variant.productStatus !== "active" || variant.variantStatus !== "active") throw new AppError(`${variant.productName} is not currently available for sale.`, 409, "STORE_ITEM_INACTIVE");
    if (variant.stockQuantity < quantity) throw new AppError(`${variant.productName}${variant.size ? ` (${variant.size})` : ""} has only ${variant.stockQuantity} in stock.`, 409, "INSUFFICIENT_STOCK");
  }

  let customerName: string;
  let customerPhone: string | null = null;
  let studentId: string | null = null;
  let guardianId: string | null = null;
  if (input.customerType === "student") {
    studentId = text(input.studentId, 120, "Student");
    const student = await tx.student.findFirst({ where: { id: studentId, schoolId: input.schoolId }, select: { name: true, admissionNo: true } });
    if (!student) throw new AppError("Student not found.", 404, "NOT_FOUND");
    customerName = `${student.name} · ${student.admissionNo}`;
  } else if (input.customerType === "guardian") {
    guardianId = text(input.guardianId, 120, "Guardian");
    const guardian = await tx.guardian.findFirst({ where: { id: guardianId, schoolId: input.schoolId }, select: { name: true, phone: true } });
    if (!guardian) throw new AppError("Guardian not found.", 404, "NOT_FOUND");
    customerName = guardian.name;
    customerPhone = guardian.phone;
  } else {
    customerName = text(input.customerName, 160, "Customer name");
    customerPhone = optionalText(input.customerPhone, 50);
  }

  const paymentMethod = text(input.paymentMethod, 40, "Payment method");
  if (!STORE_PAYMENT_METHODS.has(paymentMethod)) throw new AppError("Payment method is not supported.", 400, "INVALID_PAYMENT_METHOD");
  const paymentReference = optionalText(input.paymentReference, 120);
  if (paymentMethod !== "Cash" && !paymentReference) throw new AppError("A payment reference is required for non-cash sales.", 400, "PAYMENT_REFERENCE_REQUIRED");
  const lineRecords = [...quantityByVariant].map(([variantId, quantity]) => {
    const variant = variantMap.get(variantId)!;
    const unitPrice = Number(variant.price);
    return { variant, quantity, unitPrice, lineTotal: money(unitPrice * quantity), label: [variant.size, variant.color].filter(Boolean).join(" / ") || null };
  });
  const subtotal = money(lineRecords.reduce((sum, line) => sum + line.lineTotal, 0));
  const discount = money(Number(input.discount ?? 0));
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw new AppError("Discount is invalid.", 400, "INVALID_INPUT");
  if (discount > 0) await requireStore(tx, input.actorId, "store:discount");
  const total = money(subtotal - discount);
  const now = new Date();
  const receiptNo = `ST-${now.toISOString().slice(0,10).replaceAll("-","")}-${createId().slice(0,6).toUpperCase()}`;
  const saleId = createId();
  await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreSale" ("id","schoolId","receiptNo","customerType","studentId","guardianId","customerName","customerPhone","paymentMethod","paymentReference","subtotal","discount","total","notes","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, saleId, input.schoolId, receiptNo, input.customerType, studentId, guardianId, customerName, customerPhone, paymentMethod, paymentReference, subtotal, discount, total, optionalText(input.notes, 500), input.actorId);
  for (const line of lineRecords) {
    const changed = await tx.$executeRawUnsafe(`UPDATE "SchoolStoreVariant" SET "stockQuantity"="stockQuantity"-$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "stockQuantity">=$3`, input.schoolId, line.variant.id, line.quantity);
    if (changed !== 1) throw new AppError("Stock changed while this sale was being recorded. Please review the cart and try again.", 409, "STOCK_CHANGED");
    await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreSaleLine" ("id","schoolId","saleId","productId","variantId","productName","variantLabel","sku","quantity","unitPrice","lineTotal") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, createId(), input.schoolId, saleId, line.variant.productId, line.variant.id, line.variant.productName, line.label, line.variant.sku, line.quantity, line.unitPrice, line.lineTotal);
    await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreStockMovement" ("id","schoolId","variantId","movementType","quantityDelta","referenceType","referenceId","notes","createdBy") VALUES ($1,$2,$3,'sale',$4,'sale',$5,$6,$7)`, createId(), input.schoolId, line.variant.id, -line.quantity, saleId, receiptNo, input.actorId);
  }
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "store.sale_completed", entityType: "SchoolStoreSale", entityId: saleId, after: { receiptNo, customerType: input.customerType, customerName, subtotal, discount, total, paymentMethod, paymentReference, lineCount: lineRecords.length } });
  return { saleId, receiptNo, total };
}

export async function voidStoreSale(tx: TenantDb, input: { schoolId: string; actorId: string; saleId: string; reason: string }) {
  await requireStore(tx, input.actorId, "store:void_sale");
  const reason = text(input.reason, 500, "Void reason");
  const sales = await tx.$queryRawUnsafe<Array<{ id: string; receiptNo: string; status: string; total: unknown }>>(`SELECT "id","receiptNo","status","total" FROM "SchoolStoreSale" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`, input.schoolId, input.saleId);
  const sale = sales[0];
  if (!sale) throw new AppError("Sale not found.", 404, "NOT_FOUND");
  if (sale.status !== "completed") throw new AppError("This sale is already void.", 409, "SALE_ALREADY_VOID");
  const lines = await tx.$queryRawUnsafe<Array<{ variantId: string; quantity: number }>>(`SELECT "variantId","quantity" FROM "SchoolStoreSaleLine" WHERE "schoolId"=$1 AND "saleId"=$2`, input.schoolId, input.saleId);
  for (const line of lines) {
    await tx.$executeRawUnsafe(`UPDATE "SchoolStoreVariant" SET "stockQuantity"="stockQuantity"+$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, line.variantId, line.quantity);
    await tx.$executeRawUnsafe(`INSERT INTO "SchoolStoreStockMovement" ("id","schoolId","variantId","movementType","quantityDelta","referenceType","referenceId","notes","createdBy") VALUES ($1,$2,$3,'void',$4,'sale',$5,$6,$7)`, createId(), input.schoolId, line.variantId, line.quantity, input.saleId, reason, input.actorId);
  }
  await tx.$executeRawUnsafe(`UPDATE "SchoolStoreSale" SET "status"='void',"voidedAt"=CURRENT_TIMESTAMP,"voidedBy"=$3,"voidReason"=$4 WHERE "schoolId"=$1 AND "id"=$2`, input.schoolId, input.saleId, input.actorId, reason);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "store.sale_voided", entityType: "SchoolStoreSale", entityId: input.saleId, before: { status: "completed", total: Number(sale.total) }, after: { status: "void", reason } });
  return { saleId: input.saleId, receiptNo: sale.receiptNo };
}

export async function schoolStoreSaleDetail(tx: TenantDb, schoolId: string, actorId: string, saleId: string) {
  await requireStore(tx, actorId, "store:view");
  const sales = await tx.$queryRawUnsafe<StoreRow[]>(`SELECT s.*,u."name" AS "cashierName",vu."name" AS "voidedByName" FROM "SchoolStoreSale" s LEFT JOIN "User" u ON u."id"=s."createdBy" AND u."schoolId"=s."schoolId" LEFT JOIN "User" vu ON vu."id"=s."voidedBy" AND vu."schoolId"=s."schoolId" WHERE s."schoolId"=$1 AND s."id"=$2 LIMIT 1`, schoolId, saleId);
  if (!sales[0]) throw new AppError("Sale not found.", 404, "NOT_FOUND");
  const lines = await tx.$queryRawUnsafe<StoreRow[]>(`SELECT "id","productName","variantLabel","sku","quantity","unitPrice","lineTotal" FROM "SchoolStoreSaleLine" WHERE "schoolId"=$1 AND "saleId"=$2 ORDER BY "productName","variantLabel"`, schoolId, saleId);
  return {
    sale: { ...sales[0], subtotal: Number(sales[0].subtotal), discount: Number(sales[0].discount), total: Number(sales[0].total) },
    lines: lines.map((line) => ({ ...line, unitPrice: Number(line.unitPrice), lineTotal: Number(line.lineTotal) })),
  };
}

export async function schoolStoreExportRows(tx: TenantDb, schoolId: string, actorId: string) {
  await requireStore(tx, actorId, "store:export");
  return tx.$queryRawUnsafe<StoreRow[]>(`SELECT s."receiptNo",s."createdAt",s."customerType",s."customerName",s."customerPhone",s."paymentMethod",s."paymentReference",s."subtotal",s."discount",s."total",s."status",u."name" AS "cashier",COALESCE(string_agg(l."productName" || COALESCE(' · ' || l."variantLabel",'') || ' × ' || l."quantity"::text, '; ' ORDER BY l."productName"),'') AS "items" FROM "SchoolStoreSale" s LEFT JOIN "SchoolStoreSaleLine" l ON l."saleId"=s."id" AND l."schoolId"=s."schoolId" LEFT JOIN "User" u ON u."id"=s."createdBy" AND u."schoolId"=s."schoolId" WHERE s."schoolId"=$1 GROUP BY s."id",u."name" ORDER BY s."createdAt" DESC LIMIT 10000`, schoolId);
}
