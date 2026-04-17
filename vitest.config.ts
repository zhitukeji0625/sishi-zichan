import { config } from "dotenv";
import path from "path";
import { defineConfig } from "vitest/config";

// 测试默认使用 .env.test，避免依赖开发者本机未提交的 .env
config({ path: path.resolve(__dirname, ".env.test") });
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
