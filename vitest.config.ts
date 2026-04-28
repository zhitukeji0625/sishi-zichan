import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { defineConfig } from "vitest/config";

const root = __dirname;
const dotenvOpts = { quiet: true } as const;
dotenv.config({ path: path.join(root, ".env"), ...dotenvOpts });
if (!process.env.DATABASE_URL) {
  const examplePath = path.join(root, ".env.example");
  if (fs.existsSync(examplePath)) {
    dotenv.config({ path: examplePath, ...dotenvOpts });
  }
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
