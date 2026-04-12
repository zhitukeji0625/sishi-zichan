import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".vitest-test-env.json");

try {
  const raw = fs.readFileSync(envFile, "utf8");
  const j = JSON.parse(raw) as { databaseUrl?: string; skipDbTests?: boolean };
  if (j.databaseUrl) process.env.DATABASE_URL = j.databaseUrl;
  if (j.skipDbTests) process.env.SKIP_DB_TESTS = "1";
} catch {
  process.env.SKIP_DB_TESTS = "1";
}
