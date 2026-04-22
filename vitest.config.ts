import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 先加载 .env.test（CI / 本地测试默认），再由 .env 覆盖（可选）
dotenv.config({ path: ".env.test" });
dotenv.config();

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
