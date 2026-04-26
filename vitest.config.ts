import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import path from "path";
import { defineConfig } from "vitest/config";

const envTest = path.resolve(__dirname, ".env.test");
const envTestExample = path.resolve(__dirname, ".env.test.example");
if (existsSync(envTest)) {
  loadEnv({ path: envTest });
} else if (existsSync(envTestExample)) {
  loadEnv({ path: envTestExample });
}
loadEnv(); // .env 若存在可覆盖（本地开发）

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
