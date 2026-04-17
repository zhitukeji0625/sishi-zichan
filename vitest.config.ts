import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";
import { DEFAULT_TEST_DATABASE_URL } from "./prisma/vitest-db";

process.env.DATABASE_URL ??= DEFAULT_TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: "./prisma/vitest-global-setup.ts",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
