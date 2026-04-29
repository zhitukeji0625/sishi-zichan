import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

const root = __dirname;
loadEnv({ path: path.join(root, ".env") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.join(root, ".env.example") });
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
