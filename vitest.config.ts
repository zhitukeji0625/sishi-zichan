import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "vitest/config";

// 先加载示例环境变量，再由本地 .env 覆盖（避免无 .env 时 Prisma 初始化失败）
dotenv.config({ path: path.resolve(process.cwd(), ".env.example") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

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
