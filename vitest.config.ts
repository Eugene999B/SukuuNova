import path from "node:path";
import { defineConfig } from "vitest/config";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src")
    }
  },
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000
  }
});
