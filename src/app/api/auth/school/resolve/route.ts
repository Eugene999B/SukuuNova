import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/lib/db";

const schema = z.object({ uniqueCode: z.string().trim().min(2).max(80) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Enter a valid school code." }, { status: 400 });
    }

    // A school code is a shared routing key, not an account credential.
    // Do not rate-limit school discovery: many staff, guardians and devices
    // can legitimately resolve the same code, including from one network.
    const uniqueCode = parsed.data.uniqueCode.toLowerCase();

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
