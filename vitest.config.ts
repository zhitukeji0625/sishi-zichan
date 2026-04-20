import { config as loadEnv } from "dotenv";
import path from "path";
import { defineConfig } from "vitest/config";

// CI / 新克隆仓库可能没有 `.env`；用 `.env.example` 补齐默认变量（本地仍以 `.env` 为准）
loadEnv({ path: path.resolve(__dirname, ".env") });
loadEnv({ path: path.resolve(__dirname, ".env.example") });

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
