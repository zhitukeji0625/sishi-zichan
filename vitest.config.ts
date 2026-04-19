import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

/** 与 AGENTS.md 本地 MariaDB 一致；fresh clone 未复制 `.env` 时仍可跑集成测试。 */
function databaseUrlForTests() {
  return process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/sishi";
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      DATABASE_URL: databaseUrlForTests(),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
