import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const envFile = resolve(root, ".env");
if (existsSync(envFile)) {
  config({ path: envFile });
} else {
  config({ path: resolve(root, ".env.example") });
}

const url = process.env.DATABASE_URL ?? "";
const isExampleCredentials = url.includes("user:password@");
if (!url || isExampleCredentials) {
  process.env.DATABASE_URL = "mysql://sishi:sishi@127.0.0.1:3306/sishi";
}
