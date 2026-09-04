import { NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const authDb = new PrismaClient();
const schema = z.object({ uniqueCode: z.string().trim().min(2).max(80) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, message: "Enter a valid school code." }, { status: 400 });

    const uniqueCode = parsed.data.uniqueCode.toLowerCase();
    const directory = await authDb.schoolLoginDirectory.findUnique({
      where: { uniqueCode },
      select: { status: true, school: { select: { name: true, status: true } } },
    });

    if (!directory || directory.status !== "active" || directory.school.status !== "active") {
      return NextResponse.json({ ok: false, message: "We could not find an active school with that code." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, school: { name: directory.school.name, uniqueCode } });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to verify that school code right now." }, { status: 500 });
  } finally {
    await authDb.$disconnect();
  }
}
