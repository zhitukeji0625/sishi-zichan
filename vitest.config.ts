import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

const root = __dirname;
dotenv.config({ path: path.join(root, ".env") });
// 不要用 .env.example 里的占位账号覆盖：会与本地 Docker（root/root）冲突
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "mysql://root:root@127.0.0.1:3306/sishi";
}

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
