import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import {
  SUPPORT_KINDS,
  SUPPORT_MODULES,
  SUPPORT_SEVERITIES,
  createStructuredSupportTicket,
  getSchoolSupportCenter,
  replyToSchoolSupportTicket,
} from "@/lib/support-center-service";

const createSchema = z.object({
  action: z.literal("create"),
  kind: z.enum(SUPPORT_KINDS),
  module: z.enum(SUPPORT_MODULES),
  severity: z.enum(SUPPORT_SEVERITIES),
  subject: z.string().trim().min(3).max(240),
  body: z.string().trim().min(5).max(5000),
  attachmentUrl: z.string().trim().max(2000).nullable().optional(),
  context: z.object({
    pagePath: z.string().trim().max(300).optional(),
    browser: z.string().trim().max(300).optional(),
    appVersion: z.string().trim().max(300).optional(),
    schoolWorkflow: z.string().trim().max(300).optional(),
    diagnosticNote: z.string().trim().max(1000).optional(),
  }).optional(),
});

const replySchema = z.object({
  action: z.literal("reply"),
  ticketId: z.string().min(1).max(100),
  body: z.string().trim().min(1).max(5000),
});

const bodySchema = z.discriminatedUnion("action", [createSchema, replySchema]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, (tx) => getSchoolSupportCenter(tx, {
      schoolId: session.schoolId,
      userId: session.userId,
    }));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, bodySchema);
    const result = await withTenant(session.schoolId, async (tx) => {
      if (input.action === "create") {
        return createStructuredSupportTicket(tx, {
          schoolId: session.schoolId,
          userId: session.userId,
          kind: input.kind,
          module: input.module,
          severity: input.severity,
          subject: input.subject,
          body: input.body,
          attachmentUrl: input.attachmentUrl,
          context: input.context,
        });
      }
      return replyToSchoolSupportTicket(tx, {
        schoolId: session.schoolId,
        userId: session.userId,
        ticketId: input.ticketId,
        body: input.body,
      });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
