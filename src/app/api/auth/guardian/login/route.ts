import { NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";
import { routeError, UnauthorizedError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { GUARDIAN_COOKIE, createGuardianSessionToken } from "@/lib/guardian-auth";
import { sessionCookieOptions } from "@/lib/auth";
import { requestIp, recordLoginAttempt, clearLoginAttempts } from "@/lib/rate-limit";

const db = new PrismaClient();
const schema = z.object({ schoolCode: z.string().trim().min(2).max(80), identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const key = await recordLoginAttempt("guardian-login:" + input.schoolCode.toLowerCase(), input.identifier, requestIp(request.headers));
    if (input.password.length < 12) throw new UnauthorizedError("This password is no longer accepted. Use the password reset flow to secure the account.");
    const school = await db.school.findUnique({ where: { uniqueCode: input.schoolCode.toLowerCase() }, select: { id: true, name: true, status: true } });
    if (!school || school.status !== "active") throw new UnauthorizedError("Invalid school or guardian credentials.");
    const guardian = await db.guardian.findFirst({
      where: { schoolId: school.id, user: { is: { status: "active", OR: [{ email: input.identifier.toLowerCase() }, { phone: input.identifier }] } } },
      select: { id: true, name: true, userId: true, user: { select: { id: true, passwordHash: true, needsPasswordChange: true } } }
    });
    if (!guardian?.user || !(await compare(input.password, guardian.user.passwordHash))) throw new UnauthorizedError("Invalid school or guardian credentials.");
    await clearLoginAttempts(key);
    const needsPasswordChange = Boolean(guardian.user.needsPasswordChange);
    const response = NextResponse.json({ ok: true, guardian: { name: guardian.name, schoolName: school.name, needsPasswordChange } });
    response.cookies.set(GUARDIAN_COOKIE, await createGuardianSessionToken({ kind: "guardian", userId: guardian.user.id, guardianId: guardian.id, schoolId: school.id, name: guardian.name, schoolName: school.name, needsPasswordChange }), sessionCookieOptions());
    response.cookies.delete("sukuunova_school_session");
    return response;
  } catch (error) { return routeError(error); }
}
