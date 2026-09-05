import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/lib/db";
const schema = z.object({ uniqueCode: z.string().trim().min(2).max(80) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, message: "Enter a valid school code." }, { status: 400 });

    const uniqueCode = parsed.data.uniqueCode.toLowerCase();
    const directory = await rawDb.schoolLoginDirectory.findUnique({
      where: { uniqueCode },
      select: { schoolId: true, status: true },
    });

    if (!directory || directory.status !== "active") {
      return NextResponse.json({ ok: false, message: "We could not find an active school with that code." }, { status: 404 });
    }

    // This endpoint runs before a school tenant has been established, so the
    // school lookup must bypass the tenant-scoped Prisma extension as well.
    const school = await rawDb.school.findUnique({
      where: { id: directory.schoolId },
      select: { name: true, status: true },
    });

    if (!school || school.status !== "active") {
      return NextResponse.json({ ok: false, message: "We could not find an active school with that code." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, school: { name: school.name, uniqueCode } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to verify that school code right now." }, { status: 500 });
  }
}
