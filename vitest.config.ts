import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const root = __dirname;
const envLocal = path.join(root, ".env");
const envExample = path.join(root, ".env.example");
if (fs.existsSync(envLocal)) {
  loadEnv({ path: envLocal, override: true });
} else {
  loadEnv({ path: envExample });
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
