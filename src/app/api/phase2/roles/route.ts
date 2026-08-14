import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import {
  createCustomRole,
  customRoleBuilderData,
  deleteCustomRole,
  updateCustomRole
} from "@/lib/role-builder-service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(2).max(80),
    permissionKeys: z.array(z.string()).max(100)
  }),
  z.object({
    action: z.literal("update"),
    roleId: z.string(),
    name: z.string().min(2).max(80),
    permissionKeys: z.array(z.string()).max(100)
  }),
  z.object({ action: z.literal("delete"), roleId: z.string() })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, (tx) =>
      customRoleBuilderData(tx, session.userId)
    );
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant<unknown>(session.schoolId, (tx) => {
      const common = { schoolId: session.schoolId, actorId: session.userId };
      if (input.action === "create") return createCustomRole(tx, { ...common, ...input });
      if (input.action === "update") return updateCustomRole(tx, { ...common, ...input });
      return deleteCustomRole(tx, { ...common, roleId: input.roleId });
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
