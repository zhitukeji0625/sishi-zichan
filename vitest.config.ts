import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

// 与 AGENTS.md 中 Docker MariaDB 一致；避免未复制 .env 时 Prisma 在初始化阶段报缺少 DATABASE_URL。
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
