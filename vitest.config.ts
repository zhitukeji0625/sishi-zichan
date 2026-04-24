import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "vitest/config";

// 优先 .env；无 DATABASE_URL 时回退到 .env.example，便于 CI 与未复制 env 的本地运行
dotenv.config({ path: path.resolve(__dirname, ".env") });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, ".env.example") });
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
