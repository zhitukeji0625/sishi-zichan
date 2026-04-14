import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

/** 集成测试需连库；占位 URL 或缺失时默认 Docker 本地 MariaDB（与 AGENTS.md 一致） */
function resolveTestDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  const placeholder = "mysql://user:password@127.0.0.1:3306/sishi";
  const localDefault = "mysql://root:root@127.0.0.1:3306/sishi";
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  if (!fromEnv || fromEnv === placeholder) {
    return localDefault;
  }
  return fromEnv;
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      DATABASE_URL: resolveTestDatabaseUrl(),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
