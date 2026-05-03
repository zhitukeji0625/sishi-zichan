import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

// 与 docker-compose 中本地 MariaDB 默认一致；CI 可通过环境变量覆盖
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
