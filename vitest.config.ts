import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "vitest/config";

// 优先加载 .env.test，便于集成测试使用独立 DATABASE_URL
dotenv.config({ path: path.resolve(__dirname, ".env.test") });
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
