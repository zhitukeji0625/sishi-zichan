import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import path, { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const envFile = resolve(root, ".env");
if (existsSync(envFile)) {
  loadEnv({ path: envFile });
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
