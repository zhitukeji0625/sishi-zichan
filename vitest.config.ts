import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 与 Next 一致：先加载 .env，缺失时再用 .env.example（保证 Prisma 在 vitest 中有 DATABASE_URL）
const root = __dirname;
dotenv.config({ path: path.join(root, ".env") });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(root, ".env.example") });
}
// CI 或未建 .env 时仍无 URL，则提供与 docker-compose 一致的本地默认值
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "mysql://root:root@127.0.0.1:3306/sishi";
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
