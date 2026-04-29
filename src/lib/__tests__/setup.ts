import { config } from "dotenv";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { integrationDbFlagPath } from "./integration-env";

const root = process.cwd();
const envPath = existsSync(resolve(root, ".env"))
  ? resolve(root, ".env")
  : resolve(root, ".env.example");
config({ path: envPath });

if (existsSync(integrationDbFlagPath)) {
  process.env.VITEST_DB_AVAILABLE = readFileSync(integrationDbFlagPath, "utf8").trim();
}
