import { z } from "zod";

const productionSchema = z.object({
  NODE_ENV: z.literal("production"),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required."),
  SCHOOL_AUTH_SECRET: z.string().min(32, "SCHOOL_AUTH_SECRET must be at least 32 characters."),
});

const optionalSchema = z.object({
  APP_URL: z.string().trim().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().trim().url().optional(),
  FACE_EMBEDDING_ENCRYPTION_KEY: z.string().min(32).optional(),
  AWS_REGION: z.string().trim().min(1).optional(),
  AWS_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  SMS_PROVIDER_URL: z.string().trim().url().optional(),
  SMS_PROVIDER_TOKEN: z.string().trim().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().trim().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().trim().min(1).optional(),
  TWILIO_WHATSAPP_FROM: z.string().trim().min(1).optional(),
});

export function validateRuntimeEnv() {
  const optional = optionalSchema.parse(process.env);
  if (process.env.NODE_ENV !== "production") return optional;

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

  if (optional.TWILIO_ACCOUNT_SID || optional.TWILIO_AUTH_TOKEN || optional.TWILIO_WHATSAPP_FROM) {
    if (!optional.TWILIO_ACCOUNT_SID || !optional.TWILIO_AUTH_TOKEN || !optional.TWILIO_WHATSAPP_FROM) {
      throw new Error("Invalid production environment configuration: Twilio WhatsApp credentials must be configured together.");
    }
  }

  return { ...required.data, ...optional };
}

export const runtimeEnv = validateRuntimeEnv();
