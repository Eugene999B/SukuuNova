import { compare } from "bcryptjs";
import { db, withTenant } from "./db";
import { UnauthorizedError } from "./errors";

const LOGIN_FAILURE = "Invalid credentials or inactive account.";

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

  return withTenant(directory.schoolId, async (tx) => {
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
  const admin = await db.platformAdmin.findUnique({
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
