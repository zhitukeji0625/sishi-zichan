import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const root = __dirname;
// 仅加载项目根目录 `.env`；默认 `npm test` 不读 `.env.example`，避免无库环境误连 MySQL。
dotenv.config({ path: path.join(root, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
