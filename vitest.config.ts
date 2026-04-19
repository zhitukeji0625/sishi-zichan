import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 先加载 .env；本地未创建 .env 时回退到 .env.example，避免 Prisma 报缺少 DATABASE_URL
loadEnv({ path: path.resolve(__dirname, ".env") });
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
