import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.test") });
config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "mysql://root:root@127.0.0.1:13306/sishi_test";
}
