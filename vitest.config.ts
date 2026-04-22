import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

config();

// CI / fresh clones may not have `.env`; integration tests need a real DB URL.
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
