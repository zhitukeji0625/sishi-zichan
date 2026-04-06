import { existsSync, readFileSync } from "fs";
import path from "path";

const flagPath = path.resolve(__dirname, ".vitest-db-available");
if (existsSync(flagPath)) {
  process.env.VITEST_DB_AVAILABLE = readFileSync(flagPath, "utf8").trim();
}
