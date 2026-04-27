import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 先加载 .env；若无 DATABASE_URL，再回退到 .env.example，便于本地/CI 在未复制 .env 时也能跑集成测试
loadEnv();
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.resolve(__dirname, ".env.example") });
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
