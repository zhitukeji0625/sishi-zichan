import fs from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv();
const envTestPath = path.resolve(__dirname, ".env.test");
if (fs.existsSync(envTestPath)) {
  loadEnv({ path: envTestPath, override: true });
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
