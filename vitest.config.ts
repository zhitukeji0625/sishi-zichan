import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { defineConfig } from "vitest/config";

dotenv.config();
if (!process.env.DATABASE_URL) {
  const example = path.resolve(process.cwd(), ".env.example");
  if (fs.existsSync(example)) {
    dotenv.config({ path: example });
  }
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/lib/__tests__/vitest-db-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
