import "dotenv/config";
import { execSync } from "node:child_process";

const DEFAULT_TEST_DATABASE_URL =
  "mysql://sishi:sishi_test_pass@127.0.0.1:3306/sishi_test";

export default function setup() {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  execSync("npx prisma db push --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env },
  });
}
