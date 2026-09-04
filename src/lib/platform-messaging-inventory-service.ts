import { createId } from "@paralleldrive/cuid2";
import type { PlatformSession } from "./auth";
import { db } from "./db";
import { AppError } from "./errors";
import { appendPlatformAudit } from "./audit";
import { requirePlatformPermission } from "./platform-permissions";

type Channel = "sms" | "whatsapp";

async function requireManager(session: PlatformSession) {
  await requirePlatformPermission(session, "billing.manage");
  if (session.role !== "super_admin") throw new AppError("Only Super Admin can manage platform messaging inventory.", 403, "FORBIDDEN");
}

export async function getMessagingInventory(session: PlatformSession) {
  await requirePlatformPermission(session, "billing.view");
  const [inventory, ledger] = await Promise.all([
    db.$queryRawUnsafe<Array<{ channel: Channel; balance: number; totalPurchased: number; updatedAt: Date }>>(`SELECT "channel","balance","totalPurchased","updatedAt" FROM "PlatformMessagingInventory" ORDER BY "channel"`),
    db.$queryRawUnsafe<Array<{ id: string; channel: Channel; entryType: string; quantity: number; balanceAfter: number; unitCost: string | null; unitPrice: string | null; schoolId: string | null; reference: string | null; notes: string | null; actorId: string; createdAt: Date }>>(`SELECT "id","channel","entryType","quantity","balanceAfter","unitCost"::text,"unitPrice"::text,"schoolId","reference","notes","actorId","createdAt" FROM "PlatformMessagingInventoryLedger" ORDER BY "createdAt" DESC LIMIT 40`),
  ]);
  return { inventory, ledger };
}

export async function recordMessagingPurchase(session: PlatformSession, input: { channel: Channel; quantity: number; unitCost: number; reference?: string; notes?: string }) {
  await requireManager(session);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new AppError("Purchase quantity must be a positive whole number.", 400, "INVALID_QUANTITY");
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) throw new AppError("Purchase cost cannot be negative.", 400, "INVALID_COST");
  const result = await db.$transaction(async (tx) => {
    const current = await tx.$queryRawUnsafe<Array<{ balance: number; totalPurchased: number }>>(`SELECT "balance","totalPurchased" FROM "PlatformMessagingInventory" WHERE "channel"=$1 FOR UPDATE`, input.channel);
    if (!current[0]) throw new AppError("Messaging inventory channel is not initialized.", 500, "INVENTORY_NOT_INITIALIZED");
    const balanceAfter = current[0].balance + input.quantity;
    const totalPurchased = current[0].totalPurchased + input.quantity;
    await tx.$executeRawUnsafe(`UPDATE "PlatformMessagingInventory" SET "balance"=$2,"totalPurchased"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "channel"=$1`, input.channel, balanceAfter, totalPurchased);
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformMessagingInventoryLedger" ("id","channel","entryType","quantity","balanceAfter","unitCost","reference","notes","actorId") VALUES ($1,$2,'purchase',$3,$4,$5,$6,$7,$8)`, createId(), input.channel, input.quantity, balanceAfter, input.unitCost, input.reference ?? null, input.notes ?? null, session.adminId);
    await appendPlatformAudit({ actorId: session.adminId, action: "messaging.inventory.purchase_recorded", targetEntity: `MessagingInventory:${input.channel}`, meta: { ...input, balanceBefore: current[0].balance, balanceAfter, totalPurchased } }, tx);
    return { balanceBefore: current[0].balance, balanceAfter, totalPurchased };
  });
  return { ...result, inventory: await getMessagingInventory(session) };
}

export async function adjustMessagingInventory(session: PlatformSession, input: { channel: Channel; quantity: number; unitCost?: number; reference?: string; notes?: string }) {
  await requireManager(session);
  if (!Number.isInteger(input.quantity) || input.quantity === 0) throw new AppError("Inventory adjustment must be a non-zero whole number.", 400, "INVALID_QUANTITY");
  const result = await db.$transaction(async (tx) => {
    const current = await tx.$queryRawUnsafe<Array<{ balance: number; totalPurchased: number }>>(`SELECT "balance","totalPurchased" FROM "PlatformMessagingInventory" WHERE "channel"=$1 FOR UPDATE`, input.channel);
    if (!current[0]) throw new AppError("Messaging inventory channel is not initialized.", 500, "INVENTORY_NOT_INITIALIZED");
    const balanceAfter = current[0].balance + input.quantity;
    if (balanceAfter < 0) throw new AppError("Inventory cannot go below zero.", 409, "INSUFFICIENT_INVENTORY");
    await tx.$executeRawUnsafe(`UPDATE "PlatformMessagingInventory" SET "balance"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "channel"=$1`, input.channel, balanceAfter);
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformMessagingInventoryLedger" ("id","channel","entryType","quantity","balanceAfter","unitCost","reference","notes","actorId") VALUES ($1,$2,'adjustment',$3,$4,$5,$6,$7,$8)`, createId(), input.channel, input.quantity, balanceAfter, input.unitCost ?? null, input.reference ?? null, input.notes ?? null, session.adminId);
    await appendPlatformAudit({ actorId: session.adminId, action: "messaging.inventory.adjusted", targetEntity: `MessagingInventory:${input.channel}`, meta: { ...input, balanceBefore: current[0].balance, balanceAfter } }, tx);
    return { balanceBefore: current[0].balance, balanceAfter };
  });
  return { ...result, inventory: await getMessagingInventory(session) };
}
