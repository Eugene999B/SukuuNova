import type { ResetDeliveryEnvelope } from "./password-reset";
import { httpSmsSender } from "./message-outbox";

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

// Sends the six-digit verification code out-of-band. The plaintext code is
// never returned to the HTTP caller and is never written to application logs.
export async function deliverResetToken(envelope: ResetDeliveryEnvelope): Promise<void> {
  const subject = "SukuuNova password reset code";
  const body =
    "Your SukuuNova password reset code is " +
    envelope.token +
    ". It expires in 10 minutes. If you did not request this, ignore this message.";

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
      channel: isEmail(envelope.recipient) ? "email" : "sms",
      error: error instanceof Error ? error.message : "Unknown delivery error"
    });
  }
}
