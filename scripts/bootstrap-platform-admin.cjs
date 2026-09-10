const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const prisma = new PrismaClient();

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("Platform admin bootstrap is production-only.");
  }
  if (String(process.env.ALLOW_PLATFORM_ADMIN_BOOTSTRAP || "").trim() !== "YES_CREATE_OFFICIAL_PLATFORM_ADMIN") {
    throw new Error("Refusing bootstrap. Set ALLOW_PLATFORM_ADMIN_BOOTSTRAP=YES_CREATE_OFFICIAL_PLATFORM_ADMIN explicitly.");
  }

  const email = required("BOOTSTRAP_PLATFORM_ADMIN_EMAIL").toLowerCase();
  const name = required("BOOTSTRAP_PLATFORM_ADMIN_NAME");
  const password = required("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD must contain at least 12 characters.");

  const passwordHash = await hash(password, 12);
  const admin = await prisma.platformAdmin.upsert({
    where: { email },
    update: { name, passwordHash, status: "active", role: "super_admin" },
    create: { name, email, passwordHash, status: "active", role: "super_admin" },
    select: { id: true, email: true, name: true, role: true, status: true },
  });

  console.info("Official SukuuNova Platform Admin is ready:", {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    status: admin.status,
  });
}

main()
  .catch((error) => {
    console.error("[platform-admin-bootstrap] fatal:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
