import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

/** 单元测试需要 Prisma；未配置时使用本地 MariaDB/MySQL 默认连接串（与 README / docker-compose 一致） */
const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/sishi";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      DATABASE_URL: databaseUrl,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
