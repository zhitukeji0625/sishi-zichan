import dotenv from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// CI / fresh clones may not have `.env`; fall back to committed defaults.
dotenv.config();
dotenv.config({ path: ".env.example" });

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
