import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";

const schema = z.object({ uniqueCode: z.string().trim().min(2).max(80) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Enter a valid school code." }, { status: 400 });
    }

    const uniqueCode = parsed.data.uniqueCode.toLowerCase();
    try {
      await recordLoginAttempt("school-resolve", uniqueCode, requestIp(request.headers));
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { ok: false, message: "Too many attempts. Try again later." },
          { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
        );
      }
      throw error;
    }

    const directory = await rawDb.schoolLoginDirectory.findUnique({
      where: { uniqueCode },
      select: { schoolId: true, status: true },
    });

    if (!directory || directory.status !== "active") {
      return NextResponse.json(
        { ok: false, message: "We could not find an active school with that code." },
        { status: 404 }
      );
    }

    // The directory lookup is intentionally pre-tenant. Once it gives us the
    // verified schoolId, establish that tenant context before reading School so
    // PostgreSQL RLS can safely expose only the matching school row.
    const school = await rawDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id', $1, true)", directory.schoolId);
      return tx.school.findUnique({
        where: { id: directory.schoolId },
        select: { name: true, status: true },
      });
    });

    if (!school || school.status !== "active") {
      return NextResponse.json(
        { ok: false, message: "We could not find an active school with that code." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, school: { name: school.name, uniqueCode } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to verify that school code right now." }, { status: 500 });
  }
}
