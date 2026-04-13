import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const envTestPath = path.join(__dirname, ".env.test");
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
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
