import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

// 与 README/AGENTS 中的本地 Docker MariaDB 默认一致，便于 CI 或未创建 .env 时跑集成测试
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
