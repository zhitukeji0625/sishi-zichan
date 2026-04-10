import fs from "fs";
import path from "path";
import { config } from "dotenv";

const root = process.cwd();
const envTest = path.join(root, ".env.test");
if (fs.existsSync(envTest)) {
  config({ path: envTest });
}
config({ path: path.join(root, ".env") });
