import path from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Vitest 不自动加载 Next 的 env；优先 .env.test（集成测试数据库）
loadEnv({ path: path.resolve(__dirname, ".env.test") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.resolve(__dirname, ".env") });
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
