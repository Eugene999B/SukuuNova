const { buildSync } = require("esbuild");

// Bundle application TypeScript at build time; keep native/database packages
// external so their normal runtime resolution and Prisma engine remain intact.
buildSync({
  entryPoints: ["src/workers/sms-worker.ts"],
  outfile: "dist/workers/sms-worker.cjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  packages: "external",
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
