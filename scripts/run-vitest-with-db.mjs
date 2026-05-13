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

/** @returns {Promise<boolean>} 是否已就绪可执行 prisma db push */
async function ensureMysql() {
  const open = await portOpen("127.0.0.1", 3307, 2000);
  if (open) return true;
  console.log("启动测试数据库 (sudo docker compose -f docker-compose.test.yml)…");
  try {
    execSync("sudo docker compose -f docker-compose.test.yml up -d --wait", {
      cwd: root,
      stdio: "inherit",
    });
    const openAfter = await portOpen("127.0.0.1", 3307, 15000);
    if (!openAfter) {
      console.warn("Docker Compose 已执行，但 127.0.0.1:3307 仍未监听；跳过 prisma db push。");
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      "无法通过 Docker 启动测试库（常见原因：未安装 Docker、daemon 未运行、无 sudo 权限）。跳过 prisma db push，仅运行 Vitest；需数据库的用例将自动跳过。",
    );
    console.warn(err instanceof Error ? err.message : String(err));
    return false;
  }
}

const dbReady = await ensureMysql();

if (dbReady) {
  execSync("npx prisma db push", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
}

const result = spawnSync("npx", ["vitest", "run"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
});

process.exit(result.status ?? 1);
