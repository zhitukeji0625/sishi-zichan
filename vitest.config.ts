import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 仅当显式开启数据库集成测试时加载 .env.test（需本机 MySQL，见 docker-compose.test.yml）
if (process.env.RUN_DB_INTEGRATION === "1") {
  dotenv.config({ path: ".env.test" });
}
dotenv.config();

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
