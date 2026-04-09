import "dotenv/config";
import { config as loadEnv } from "dotenv";
import path from "path";
import { defineConfig } from "vitest/config";

// 可选：复制 .env.example 为 .env.test 并指向本地测试库，以运行 placeBid 集成测试
loadEnv({ path: path.resolve(__dirname, ".env.test"), override: true, quiet: true });

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
