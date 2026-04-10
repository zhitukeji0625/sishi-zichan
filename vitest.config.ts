import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

// `npm run test` without a local `.env` (CI / fresh clones). Matches AGENTS.md Docker MariaDB.
if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = "mysql://root:root@127.0.0.1:3306/sishi";
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
