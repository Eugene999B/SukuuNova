import type { ResetDeliveryEnvelope } from "./password-reset";
import { httpSmsSender } from "./message-outbox";

const DEV_TOKEN_ECHO_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_TOKEN_ECHO === "true";

type EmailSender = (input: { to: string; subject: string; body: string }) => Promise<void>;

const httpEmailSender: EmailSender = async ({ to, subject, body }) => {
  const url = process.env.EMAIL_PROVIDER_URL;
  const token = process.env.EMAIL_PROVIDER_TOKEN;
  const from = process.env.EMAIL_FROM;
  if (!url || !token || !from) {
    throw new Error(
      "Email provider is not configured (EMAIL_PROVIDER_URL / EMAIL_PROVIDER_TOKEN / EMAIL_FROM)."
    );
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ from, to, subject, text: body })
  });
  if (!response.ok) throw new Error("Email provider returned HTTP " + response.status);
};

function isEmail(value: string): boolean {
  return value.includes("@");
}

function buildResetUrl(envelope: ResetDeliveryEnvelope): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("APP_URL must be configured in production for password recovery links.");
  }
  const base = (configured || "http://localhost:3000").replace(/\/$/, "");
  const path = envelope.universe === "platform"
    ? "/platform/reset-password"
    : envelope.universe === "guardian"
      ? "/login/guardian/password-reset"
      : "/login/school/password-reset";
  const params = new URLSearchParams({ token: envelope.token });
  if (envelope.schoolCode) params.set("schoolCode", envelope.schoolCode);
  return base + path + "?" + params.toString();
}

// Sends the reset token out-of-band (email or SMS depending on the recipient
// identifier). The token is NEVER returned to the HTTP caller and NEVER
// rendered in any UI. Delivery failures are logged server-side only — they
// must never change the API response shape or leak the token.
export async function deliverResetToken(envelope: ResetDeliveryEnvelope): Promise<void> {
  const resetUrl = buildResetUrl(envelope);
  const subject = "SukuuNova password reset";
  const body =
    "A password reset was requested for your SukuuNova " +
    envelope.universe +
    " account" +
    (envelope.schoolCode ? " (school " + envelope.schoolCode + ")" : "") +
    ". Use this link to set a new password: " +
    resetUrl +
    ". This link expires at " +
    envelope.expiresAt.toISOString() +
    ". If you did not request this, you can ignore this message.";

  try {
    if (isEmail(envelope.recipient)) {
      await httpEmailSender({ to: envelope.recipient, subject, body });
    } else {
      await httpSmsSender({ phone: envelope.recipient, body });
    }
  } catch (error) {
    console.error("Password reset delivery failed", {
      universe: envelope.universe,
      expiresAt: envelope.expiresAt.toISOString(),
      error: error instanceof Error ? error.message : "Unknown delivery error"
    });
  }

  if (DEV_TOKEN_ECHO_ENABLED) {
    console.warn("[DEV ONLY] Password reset link (never sent to any client response):", resetUrl);
  }
}
