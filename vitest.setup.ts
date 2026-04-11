import { existsSync } from "node:fs";
import { config } from "dotenv";
import path from "path";

const root = path.resolve(__dirname);
for (const name of [".env.test", ".env"]) {
  const p = path.join(root, name);
  if (existsSync(p)) {
    config({ path: p });
  }
}
