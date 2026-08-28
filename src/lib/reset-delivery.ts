import type { ResetDeliveryEnvelope } from "./password-reset";

// Phase 0 deliberately contains no email/SMS/WhatsApp integration.
// Replace this adapter with a secure provider in a later authorized phase.
// The raw token is never logged or returned by an API route.
export async function deliverResetToken(
  envelope: ResetDeliveryEnvelope
): Promise<void> {
  void envelope.token;
  console.info("Password reset token prepared for external delivery", {
    universe: envelope.universe,
    recipient: envelope.recipient,
    expiresAt: envelope.expiresAt.toISOString(),
    deliveryAdapterConfigured: false
  });
}
