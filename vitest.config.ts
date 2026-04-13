import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

const DEFAULT_TEST_DATABASE_URL =
  "mysql://sishi:sishi_test_pass@127.0.0.1:3306/sishi_test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: "./vitest.global-setup.ts",
    env: {
      DATABASE_URL: testDatabaseUrl,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
