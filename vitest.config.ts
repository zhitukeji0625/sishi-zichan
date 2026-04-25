import dotenv from "dotenv";
import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

// 先加载示例环境变量，再由本地 .env 覆盖（CI / 无 .env 时仍有 DATABASE_URL 等）
dotenv.config({ path: path.resolve(__dirname, ".env.example") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const excludeIntegration =
  process.env.RUN_INTEGRATION_TESTS === "1"
    ? [...configDefaults.exclude]
    : [...configDefaults.exclude, "**/*.integration.test.ts"];

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: excludeIntegration,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
