import { NextResponse } from "next/server";
import { applyArkeselSmsDeliveryReceipt, normalizeSmsProviderDeliveryStatus } from "@/lib/sms-delivery-receipts";

async function handle(request: Request) {
  const url = new URL(request.url);
  const smsId = url.searchParams.get("sms_id")?.trim() || "";
  const rawStatus = url.searchParams.get("status")?.trim() || "";
  const status = normalizeSmsProviderDeliveryStatus(rawStatus);

  if (!smsId || !status) {
    return NextResponse.json({ received: false, error: "INVALID_DELIVERY_RECEIPT" }, { status: 400 });
  }

  const result = await applyArkeselSmsDeliveryReceipt({ smsId, status });
  // The endpoint intentionally has no session/auth requirement because Arkesel
  // delivery callbacks are public. Unknown sms_id values are harmless: only
  // provider IDs already stored by SukuuNova can update a delivery record.
  return NextResponse.json({ received: true, matched: result.matched, status });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
