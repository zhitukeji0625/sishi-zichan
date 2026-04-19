import path from "path";
import { config } from "dotenv";

if (process.env.RUN_DB_TESTS === "true") {
  config({ path: path.resolve(process.cwd(), ".env.test") });
}
