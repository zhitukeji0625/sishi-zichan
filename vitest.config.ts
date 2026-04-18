import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// Load `.env` when present; otherwise use the same local defaults as AGENTS.md/README.
loadEnv();
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
