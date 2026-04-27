import path from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// 优先 .env；无则回退 .env.example，避免未复制 .env 时 Prisma 报缺少 DATABASE_URL
loadEnv({ path: path.resolve(__dirname, ".env") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.resolve(__dirname, ".env.example") });
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
