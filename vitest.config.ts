import path from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// 先加载 .env，再用 .env.test 覆盖（便于本地用独立测试库）
loadEnv({ path: path.resolve(__dirname, ".env") });
loadEnv({ path: path.resolve(__dirname, ".env.test"), override: true });

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
