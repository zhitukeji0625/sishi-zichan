import { existsSync } from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const testEnvPath = path.resolve(__dirname, ".env.test");
if (existsSync(testEnvPath)) {
  loadEnv({ path: testEnvPath });
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "mysql://root:root@127.0.0.1:3306/sishi";
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
