import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

// 与 AGENTS.md 中本地 MariaDB 一致，便于未创建 .env 时运行 `npm test`
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
