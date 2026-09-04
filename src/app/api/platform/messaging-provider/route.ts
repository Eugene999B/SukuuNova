import { NextResponse } from "next/server";
import { requirePlatformSession } from "@/lib/auth";
import { routeError } from "@/lib/errors";
import { requirePlatformPermission } from "@/lib/platform-permissions";

export async function GET() {
  try {
    const session = await requirePlatformSession();
    await requirePlatformPermission(session, "billing.view");
    const sms = {
      configured: Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_TOKEN),
      endpointConfigured: Boolean(process.env.SMS_PROVIDER_URL),
      tokenConfigured: Boolean(process.env.SMS_PROVIDER_TOKEN),
      senderConfigured: Boolean(process.env.SMS_SENDER_ID),
    };
    const whatsapp = {
      configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
      accountConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID),
      authConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN),
      senderConfigured: Boolean(process.env.TWILIO_WHATSAPP_FROM),
    };
    return NextResponse.json({ checkedAt: new Date().toISOString(), sms, whatsapp });
  } catch (error) {
    return routeError(error);
  }
}
