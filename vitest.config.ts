import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) {
  loadEnv({ path: ".env" });
} else {
  loadEnv();
}
import path from "path";

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
