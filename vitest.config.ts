import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const root = __dirname;
const testEnv = path.join(root, ".env.test");
if (fs.existsSync(testEnv)) {
  dotenv.config({ path: testEnv });
} else {
  dotenv.config();
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
