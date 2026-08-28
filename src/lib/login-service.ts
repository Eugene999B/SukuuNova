import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";
import { db } from "./db";
import { UnauthorizedError } from "./errors";

const LOGIN_FAILURE = "Invalid credentials or inactive account.";

const globalForAuthPrisma = globalThis as unknown as {
  sukuunovaAuthPrisma?: PrismaClient;
};

const authDb =
  globalForAuthPrisma.sukuunovaAuthPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForAuthPrisma.sukuunovaAuthPrisma = authDb;
}

function normalizedIdentifier(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
}

export async function authenticateSchoolUser(input: {
  uniqueCode: string;
  identifier: string;
  password: string;
}) {
  const uniqueCode = input.uniqueCode.trim().toLowerCase();
  const directory = await db.schoolLoginDirectory.findUnique({
    where: { uniqueCode }
  });
  if (!directory || directory.status !== "active") {
    throw new UnauthorizedError(LOGIN_FAILURE);
  }

  return authDb.$transaction(async (tx) => {
    // Authentication establishes the tenant explicitly on the same database
    // transaction/connection before querying FORCE RLS protected tables.
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_school_id', $1, true)",
      directory.schoolId
    );

    const school = await tx.school.findUnique({
      where: { id: directory.schoolId },
      select: { id: true, name: true, status: true }
    });
    if (!school || school.status !== "active") {
      throw new UnauthorizedError(LOGIN_FAILURE);
    }

    const identifier = normalizedIdentifier(input.identifier);
    const user = await tx.user.findFirst({
      where: {
        schoolId: directory.schoolId,
        status: "active",
        OR: [{ email: identifier }, { phone: identifier }]
      },
      select: {
        id: true,
        schoolId: true,
        name: true,
        passwordHash: true
      }
    });

    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedError(LOGIN_FAILURE);
    }

    return {
      userId: user.id,
      schoolId: user.schoolId,
      name: user.name,
      schoolName: school.name
    };
  });
}

export async function authenticatePlatformAdmin(input: {
  email: string;
  password: string;
}) {
  const admin = await authDb.platformAdmin.findUnique({
    where: { email: input.email.trim().toLowerCase() }
  });

  if (
    !admin ||
    admin.status !== "active" ||
    !(await compare(input.password, admin.passwordHash))
  ) {
    throw new UnauthorizedError(LOGIN_FAILURE);
  }

  return {
    adminId: admin.id,
    name: admin.name,
    role: admin.role
  };
}
