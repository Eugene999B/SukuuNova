import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";
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
  const directory = await authDb.schoolLoginDirectory.findUnique({
    where: { uniqueCode },
    select: { schoolId: true, status: true }
  });

  if (!directory || directory.status !== "active") {
    throw new UnauthorizedError(LOGIN_FAILURE);
  }

  return authDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_school_id', $1, true)",
      directory.schoolId
    );

    const schoolRows = await tx.$queryRaw<
      { id: string; name: string; status: string }[]
    >`
      SELECT "id", "name", "status"
      FROM "School"
      WHERE "id" = ${directory.schoolId}
      LIMIT 1
    `;

    const school = schoolRows[0];
    if (!school || school.status !== "active") {
      throw new UnauthorizedError(LOGIN_FAILURE);
    }

    const identifier = normalizedIdentifier(input.identifier);
    const userRows = await tx.$queryRaw<
      { id: string; schoolId: string; name: string; passwordHash: string; status: string }[]
    >`
      SELECT "id", "schoolId", "name", "passwordHash", "status"
      FROM "User"
      WHERE "schoolId" = ${directory.schoolId}
        AND "status" = 'active'
        AND ("email" = ${identifier} OR "phone" = ${identifier})
      LIMIT 1
    `;

    const user = userRows[0];
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
    where: { email: input.email.trim().toLowerCase() },
    select: { id: true, name: true, passwordHash: true, status: true, role: true }
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
