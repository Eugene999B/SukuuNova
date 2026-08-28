const names = [
  "SEED_SCHOOL_CODE",
  "SEED_SCHOOL_NAME",
  "SEED_OWNER_NAME",
  "SEED_OWNER_EMAIL",
  "SEED_OWNER_PASSWORD",
  "SEED_PLATFORM_ADMIN_NAME",
  "SEED_PLATFORM_ADMIN_EMAIL",
  "SEED_PLATFORM_ADMIN_PASSWORD",
];
for (const name of names) console.log(`${name}=${process.env[name] ? "present" : "missing"}`);
