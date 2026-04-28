import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

// `placeBid` 等集成测试需要 Prisma；与 README/AGENTS 中本地 Docker MariaDB 默认一致。
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
