import { config } from "dotenv";
import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

// 先加载 .env.test（测试库），再加载 .env 以便本地覆盖
config({ path: path.resolve(__dirname, ".env.test") });
config({ path: path.resolve(__dirname, ".env") });

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: runIntegration
      ? configDefaults.exclude
      : [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
