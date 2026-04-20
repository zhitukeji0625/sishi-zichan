import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

// 本地/CI 未提供 .env 时，Vitest 仍需要 Prisma 可解析的连接串（默认对接 scripts 或 compose 暴露的测试库端口）
process.env.DATABASE_URL ??=
  "mysql://root:root@127.0.0.1:3307/sishi";
process.env.SESSION_SECRET ??=
  "vitest-session-secret-must-be-long-enough-32";
process.env.THIRD_PARTY_JWT_SECRET ??= "vitest-third-party-jwt-secret";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.COOKIE_SECURE ??= "false";

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
