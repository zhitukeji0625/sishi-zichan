import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "vitest/config";

// 先加载示例环境变量，再由本地 .env 覆盖（无 .env 时测试仍能得到 DATABASE_URL 等）
dotenv.config({ path: path.resolve(process.cwd(), ".env.example") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
  },
});
