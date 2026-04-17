import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

dotenv.config({ path: ".env.test", quiet: true });
dotenv.config({ path: ".env", quiet: true });

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
