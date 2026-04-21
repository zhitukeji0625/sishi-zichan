import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { defineConfig } from "vitest/config";

const root = __dirname;
const envPath = path.join(root, ".env");
dotenv.config({
  path: fs.existsSync(envPath) ? envPath : path.join(root, ".env.example"),
});

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
