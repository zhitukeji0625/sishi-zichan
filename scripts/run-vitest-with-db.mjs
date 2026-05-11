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

function startTestMysql() {
  const cmd =
    "docker compose -f docker-compose.test.yml up -d --wait";
  try {
    execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
    return;
  } catch {
    console.log("docker compose 失败，尝试 sudo docker compose…");
  }
  execSync(`sudo ${cmd}`, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
}

async function ensureMysql() {
  const open = await portOpen("127.0.0.1", 3307, 2000);
  if (open) return;
  console.log("启动测试数据库 (docker compose -f docker-compose.test.yml)…");
  try {
    startTestMysql();
  } catch {
    console.error(
      "无法启动测试数据库：请确认 Docker 守护进程已运行，且具备 docker compose 权限。\n" +
        "可手动执行：docker compose -f docker-compose.test.yml up -d --wait",
    );
    process.exit(1);
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
