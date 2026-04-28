import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// Load `.env` when present; CI / fresh clones often have no `.env` file.
dotenv.config({ path: path.resolve(__dirname, ".env") });
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
