import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env.test"), quiet: true });
dotenv.config({ path: path.resolve(__dirname, ".env"), quiet: true });

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
