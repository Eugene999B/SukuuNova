import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/lib/auth";
import { routeError } from "@/lib/errors";
import { getMessagingInventory, recordMessagingPurchase, adjustMessagingInventory } from "@/lib/platform-messaging-inventory-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("purchase"), channel: z.enum(["sms", "whatsapp"]), quantity: z.number().int().positive(), unitCost: z.number().min(0), reference: z.string().max(160).optional(), notes: z.string().max(500).optional() }),
  z.object({ action: z.literal("adjust"), channel: z.enum(["sms", "whatsapp"]), quantity: z.number().int().refine((value) => value !== 0, "Quantity cannot be zero."), unitCost: z.number().min(0).optional(), reference: z.string().max(160).optional(), notes: z.string().max(500).optional() }),
]);

export async function GET() {
  try {
    return NextResponse.json(await getMessagingInventory(await requirePlatformSession()));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformSession();
    const input = schema.parse(await request.json());
    if (input.action === "purchase") return NextResponse.json(await recordMessagingPurchase(session, input));
    return NextResponse.json(await adjustMessagingInventory(session, input));
  } catch (error) {
    return routeError(error);
  }
}
