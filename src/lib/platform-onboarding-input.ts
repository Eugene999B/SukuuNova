import { z } from "zod";

export const platformOnboardingSchema = z.object({
  leadership: z.array(z.object({
    role: z.enum(["Principal", "Administrator"]),
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().toLowerCase().email(),
  })).max(2).default([]),
  uniqueCode: z.string().min(3).max(40), schoolName: z.string().trim().min(2).max(160), schoolType: z.string().max(60).optional(), country: z.string().max(80).optional(), region: z.string().max(120).optional(), city: z.string().max(120).optional(), address: z.string().max(400).optional(), schoolPhone: z.string().max(40).optional(), schoolEmail: z.string().email().optional().or(z.literal("")),
  ownerName: z.string().trim().min(2).max(160), ownerEmail: z.string().trim().toLowerCase().email(), ownerPhone: z.string().max(40).optional(), ownerPassword: z.string().min(12).max(256), currency: z.string().min(3).max(8).default("GHS"), billingMode: z.enum(["flat", "per_student"]).default("flat"), studentRate: z.coerce.number().finite().min(0).default(0), flatRate: z.coerce.number().finite().min(0).default(0), billingDay: z.coerce.number().int().min(1).max(28).default(1), graceDays: z.coerce.number().int().min(0).max(90).default(7), trialDays: z.coerce.number().int().min(0).max(365).default(0), timezone: z.string().trim().min(3).max(80).default("Africa/Accra").refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Enter a valid IANA timezone."),
}).superRefine((input, context) => {
  const emails = [input.ownerEmail, ...input.leadership.map((person) => person.email)];
  if (new Set(emails).size !== emails.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["leadership"], message: "Each leadership account needs a different email address." });
  }
  if (new Set(input.leadership.map((person) => person.role)).size !== input.leadership.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["leadership"], message: "Provide at most one Principal and one Administrator." });
  }
});
