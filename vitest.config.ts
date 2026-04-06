import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import { resolve } from "path";

// 测试使用 .env.test（本地与 CI 可与 docker-compose 中 MySQL 一致）
loadEnv({ path: resolve(__dirname, ".env.test") });
import path from "path";

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
