import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const root = __dirname;
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
if (!process.env.DATABASE_URL && fs.existsSync(examplePath)) {
  dotenv.config({ path: examplePath });
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
