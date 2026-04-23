import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

const root = __dirname;
const placeholderDbUrl = "mysql://user:password@127.0.0.1:3306/sishi";
const defaultTestDbUrl = "mysql://root:root@127.0.0.1:3306/sishi";

loadEnv({ path: path.join(root, ".env") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.join(root, ".env.example") });
}
if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL === placeholderDbUrl
) {
  process.env.DATABASE_URL = defaultTestDbUrl;
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
