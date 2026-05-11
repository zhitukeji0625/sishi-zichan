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

function startComposeMysql() {
  const args = ["compose", "-f", "docker-compose.test.yml", "up", "-d", "--wait"];
  const tryRun = (prefix) => {
    const cmd = prefix.length ? [...prefix, "docker", ...args] : ["docker", ...args];
    execSync(cmd.join(" "), { cwd: root, stdio: "inherit" });
  };
  try {
    console.log("启动测试数据库 (docker compose -f docker-compose.test.yml)…");
    tryRun([]);
    return;
  } catch {
    // 部分环境需要 root 才能访问 docker.sock
  }
  try {
    console.log("重试：sudo docker compose -f docker-compose.test.yml …");
    tryRun(["sudo"]);
    return;
  } catch {
    console.error(
      "无法通过 Docker 启动测试库。请安装并启动 Docker 后重试，或在 127.0.0.1:3307 手动启动与 .env.test 中 DATABASE_URL 一致的 MariaDB/MySQL（参见 docker-compose.test.yml）。",
    );
    process.exit(1);
  }
}

async function ensureMysql() {
  const open = await portOpen("127.0.0.1", 3307, 2000);
  if (open) return;
  startComposeMysql();
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
