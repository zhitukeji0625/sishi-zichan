import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// 优先 `.env` / `.env.local`；存在 `.env.test` 时用于 Vitest（覆盖本地开发库）；否则回退 `.env.example`
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });
const envTestPath = path.resolve(__dirname, ".env.test");
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath, override: true });
} else if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, ".env.example") });
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
