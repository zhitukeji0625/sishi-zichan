import { config } from "dotenv";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  config({ path: envPath });
}

// Matches AGENTS.md / README Docker MariaDB defaults when `.env` is absent.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "mysql://root:root@127.0.0.1:3306/sishi";
}
