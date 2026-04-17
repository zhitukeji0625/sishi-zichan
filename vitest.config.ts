import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 与 Next 一致：仅加载本地 .env；无数据库时集成测试会被跳过，纯逻辑单测仍可运行
dotenv.config({ path: path.resolve(__dirname, ".env") });

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
