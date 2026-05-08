import { execSync, spawnSync } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
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

function dockerSocketReady() {
  try {
    accessSync("/var/run/docker.sock", fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDockerDaemon() {
  if (dockerSocketReady()) return;
  console.log("未检测到 Docker socket，尝试启动 dockerd…");
  execSync("sudo sh -c 'nohup dockerd > /tmp/dockerd.log 2>&1 &'", {
    stdio: "inherit",
  });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    if (dockerSocketReady()) {
      console.log("Docker daemon 已就绪");
      return;
    }
  }
  throw new Error(
    "无法在 45s 内启动 Docker。请手动执行：sudo nohup dockerd > /tmp/dockerd.log 2>&1 &",
  );
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

await ensureDockerDaemon();
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
