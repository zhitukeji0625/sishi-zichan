import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
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

function dockerSocketExists() {
  try {
    return fs.existsSync("/var/run/docker.sock");
  } catch {
    return false;
  }
}

/** Linux CI：未预先启动 dockerd 时 compose 会报 socket 不存在；macOS/Windows 由 Docker Desktop 提供 CLI，不依赖该路径 */
async function ensureDockerDaemon() {
  if (process.platform !== "linux") return;
  if (dockerSocketExists()) return;
  console.log("未检测到 Docker 套接字，尝试后台启动 dockerd（sudo）…");
  try {
    execSync("sudo nohup dockerd > /tmp/dockerd.log 2>&1 &", {
      stdio: "ignore",
    });
  } catch {
    throw new Error(
      "无法启动 dockerd。请手动执行: sudo nohup dockerd > /tmp/dockerd.log 2>&1 &",
    );
  }
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (dockerSocketExists()) {
      console.log("Docker 已就绪");
      return;
    }
  }
  throw new Error(
    "Docker 在 45s 内未就绪，请查看 /tmp/dockerd.log 或检查本机容器服务。",
  );
}

async function ensureMysql() {
  const open = await portOpen("127.0.0.1", 3307, 2000);
  if (open) return;
  await ensureDockerDaemon();
  console.log("启动测试数据库 (sudo docker compose -f docker-compose.test.yml)…");
  try {
    execSync("sudo docker compose -f docker-compose.test.yml up -d --wait", {
      cwd: root,
      stdio: "inherit",
    });
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.includes("docker.sock") || msg.includes("Docker")) {
      console.error(
        "\n提示: 若 Docker 未运行，可先执行: sudo nohup dockerd > /tmp/dockerd.log 2>&1 &\n",
      );
    }
    throw err;
  }
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
