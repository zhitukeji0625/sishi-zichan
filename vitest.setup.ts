import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ quiet: true });
if (!process.env.DATABASE_URL) {
  const examplePath = path.resolve(__dirname, ".env.example");
  if (fs.existsSync(examplePath)) {
    dotenv.config({ path: examplePath, quiet: true });
  }
}
