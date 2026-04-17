import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 可选 `.env.test`（见 `.env.test.example`），再由 `.env` 覆盖本地自定义
dotenv.config({ path: ".env.test" });
dotenv.config();

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
