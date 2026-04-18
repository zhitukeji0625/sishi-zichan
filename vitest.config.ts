import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const envTest = path.resolve(__dirname, ".env.test");
if (existsSync(envTest)) {
  loadEnv({ path: envTest });
} else {
  loadEnv();
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
