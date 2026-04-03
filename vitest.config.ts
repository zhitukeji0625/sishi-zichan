import path from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// 先加载 .env.test（仓库内约定），再由 .env 覆盖，避免仅有 README 时 `npm test` 缺少 DATABASE_URL
loadEnv({ path: path.resolve(__dirname, ".env.test") });
loadEnv({ path: path.resolve(__dirname, ".env") });

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
