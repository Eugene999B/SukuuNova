const { execFileSync } = require("node:child_process");

if (process.env.VERCEL_ENV !== "production") process.exit(0);

const required = [
  "SEED_SCHOOL_CODE",
  "SEED_SCHOOL_NAME",
  "SEED_OWNER_NAME",
  "SEED_OWNER_EMAIL",
  "SEED_OWNER_PASSWORD",
  "SEED_PLATFORM_ADMIN_EMAIL",
  "SEED_PLATFORM_ADMIN_PASSWORD",
];

const hasSeedInputs = required.every((name) => Boolean(process.env[name]?.trim()));
if (process.env.SUKUUNOVA_ONE_TIME_SEED !== "true" && !hasSeedInputs) {
  console.log("SukuuNova one-time production seed is disabled: seed inputs are not configured.");
  process.exit(0);
}

console.log("Running SukuuNova one-time production seed...");
execFileSync("npx", ["prisma", "db", "seed"], { stdio: "inherit" });
console.log("SukuuNova one-time production seed completed.");
