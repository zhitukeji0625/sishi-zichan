import fs from "node:fs";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "vitest/config";

const root = path.resolve(__dirname);
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

/** Local Vitest default matches Docker MariaDB in AGENTS.md when `.env` is absent. */
const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/sishi";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      DATABASE_URL: databaseUrl,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
