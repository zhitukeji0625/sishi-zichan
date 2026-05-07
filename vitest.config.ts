import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env.test") });
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
