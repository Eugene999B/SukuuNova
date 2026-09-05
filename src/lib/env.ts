import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().url().optional(),
);

const productionSchema = z.object({
  NODE_ENV: z.literal("production"),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required."),
  SCHOOL_AUTH_SECRET: z.string().min(32, "SCHOOL_AUTH_SECRET must be at least 32 characters."),
  GUARDIAN_AUTH_SECRET: z.string().min(32, "GUARDIAN_AUTH_SECRET must be at least 32 characters."),
  QR_AUTH_SECRET: z.string().min(32, "QR_AUTH_SECRET must be at least 32 characters."),
  PLATFORM_AUTH_SECRET: z.string().min(32, "PLATFORM_AUTH_SECRET must be at least 32 characters."),
});

const optionalSchema = z.object({
  APP_URL: optionalUrl,
  NEXT_PUBLIC_APP_URL: optionalUrl,
  FACE_EMBEDDING_ENCRYPTION_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(32).optional(),
  ),
  AWS_REGION: optionalString,
  AWS_ACCESS_KEY_ID: optionalString,
  AWS_SECRET_ACCESS_KEY: optionalString,
  SMS_PROVIDER_URL: optionalUrl,
  SMS_PROVIDER_TOKEN: optionalString,
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_WHATSAPP_FROM: optionalString,
  WHATSAPP_WEBHOOK_SECRET: optionalString,
  WHATSAPP_APP_SECRET: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,
});

export function validateRuntimeEnv() {
  const optional = optionalSchema.parse(process.env);
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return optional;
  }

  const required = productionSchema.safeParse(process.env);
  if (!required.success) {
    const details = required.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid production environment configuration: ${details}`);
  }

  if ((optional.AWS_ACCESS_KEY_ID && !optional.AWS_SECRET_ACCESS_KEY) || (!optional.AWS_ACCESS_KEY_ID && optional.AWS_SECRET_ACCESS_KEY)) {
    throw new Error("Invalid production environment configuration: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be provided together.");
  }

  if (optional.SMS_PROVIDER_URL && !optional.SMS_PROVIDER_TOKEN) {
    throw new Error("Invalid production environment configuration: SMS_PROVIDER_TOKEN is required when SMS_PROVIDER_URL is configured.");
  }

  if (optional.SMS_PROVIDER_TOKEN && !optional.SMS_PROVIDER_URL) {
    throw new Error("Invalid production environment configuration: SMS_PROVIDER_URL is required when SMS_PROVIDER_TOKEN is configured.");
  }

  if ((optional.WHATSAPP_APP_SECRET && optional.WHATSAPP_APP_SECRET.length < 32) || (optional.WHATSAPP_WEBHOOK_SECRET && optional.WHATSAPP_WEBHOOK_SECRET.length < 32) || (optional.WHATSAPP_VERIFY_TOKEN && optional.WHATSAPP_VERIFY_TOKEN.length < 16)) {
    throw new Error("Invalid production environment configuration: WhatsApp webhook secrets are too short.");
  }

  if (optional.TWILIO_ACCOUNT_SID || optional.TWILIO_AUTH_TOKEN || optional.TWILIO_WHATSAPP_FROM) {
    if (!optional.TWILIO_ACCOUNT_SID || !optional.TWILIO_AUTH_TOKEN || !optional.TWILIO_WHATSAPP_FROM) {
      throw new Error("Invalid production environment configuration: Twilio WhatsApp credentials must be configured together.");
    }
  }

  return { ...required.data, ...optional };
}

export const runtimeEnv = validateRuntimeEnv();
