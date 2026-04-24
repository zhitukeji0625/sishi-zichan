import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 先加载 .env；未设置的变量再由 .env.test 补全（本地 Docker MariaDB 默认连接）
loadEnv({ path: path.resolve(__dirname, ".env"), quiet: true });
loadEnv({ path: path.resolve(__dirname, ".env.test"), quiet: true });

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
