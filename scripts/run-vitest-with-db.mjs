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

function dockerComposeUp() {
  const commands = [
    "docker compose -f docker-compose.test.yml up -d --wait",
    "sudo docker compose -f docker-compose.test.yml up -d --wait",
  ];
  for (const cmd of commands) {
    try {
      execSync(cmd, { cwd: root, stdio: "inherit" });
      return true;
    } catch {
      // try next command
    }
  }
  return false;
}

async function ensureMysql() {
  const open = await portOpen("127.0.0.1", 3307, 2000);
  if (open) return true;
  console.log("启动测试数据库 (docker compose -f docker-compose.test.yml)…");
  return dockerComposeUp();
}

const dbReady = await ensureMysql();

if (dbReady) {
  execSync("npx prisma db push", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
} else {
  console.warn(
    "未能连接 127.0.0.1:3307 且无法通过 Docker 启动测试库；跳过 prisma db push，仅运行不依赖 MySQL 的测试。",
  );
}

const vitestEnv = dbReady
  ? { ...process.env }
  : (() => {
      const env = { ...process.env };
      delete env.DATABASE_URL;
      return env;
    })();

const result = spawnSync("npx", ["vitest", "run"], {
  cwd: root,
  stdio: "inherit",
  env: vitestEnv,
});

process.exit(result.status ?? 1);
