const { execFileSync } = require("node:child_process");

if (process.env.VERCEL_ENV !== "production") process.exit(0);

if (process.env.SUKUUNOVA_ONE_TIME_SEED !== "true") {
  console.log("SukuuNova one-time production seed is disabled.");
  process.exit(0);
}

console.log("Running SukuuNova one-time production seed...");
execFileSync("npx", ["prisma", "db", "seed"], { stdio: "inherit" });
console.log("SukuuNova one-time production seed completed.");
