import { execSync, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.test") });

if (!process.env.DATABASE_URL) {
  console.error("缺少 DATABASE_URL：请确认存在 .env.test");
  process.exit(1);
}

function portOpen(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function ensureMysql() {
  const open = await portOpen("127.0.0.1", 3307, 2000);
  if (open) return;
  console.log("启动测试数据库 (sudo docker compose -f docker-compose.test.yml)…");
  execSync("sudo docker compose -f docker-compose.test.yml up -d --wait", {
    cwd: root,
    stdio: "inherit",
  });
}

await ensureMysql();

execSync("npx prisma db push", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
});

const result = spawnSync("npx", ["vitest", "run"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
});

process.exit(result.status ?? 1);
