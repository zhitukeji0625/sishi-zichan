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

function dockerDaemonReachable() {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function startTestMysql() {
  const cmd =
    "docker compose -f docker-compose.test.yml up -d --wait";
  try {
    execSync(cmd, { cwd: root, stdio: "inherit" });
    return true;
  } catch {
    try {
      execSync(`sudo ${cmd}`, { cwd: root, stdio: "inherit" });
      return true;
    } catch {
      return false;
    }
  }
}

/** @returns {Promise<boolean>} 是否可对测试库执行 prisma db push 并跑需 DATABASE_URL 的用例 */
async function ensureMysql() {
  if (await portOpen("127.0.0.1", 3307, 2000)) return true;

  if (!dockerDaemonReachable()) {
    console.warn(
      "未检测到 Docker 守护进程：跳过 prisma db push 与需数据库的集成用例，仅运行单元测试。",
    );
    return false;
  }

  console.log("启动测试数据库 (docker compose -f docker-compose.test.yml)…");
  if (!startTestMysql()) {
    console.warn("无法启动测试数据库容器：跳过集成用例，仅运行单元测试。");
    return false;
  }

  if (await portOpen("127.0.0.1", 3307, 5000)) return true;

  console.warn("测试库端口 3307 仍不可用：跳过集成用例，仅运行单元测试。");
  return false;
}

const dbReady = await ensureMysql();

if (dbReady) {
  execSync("npx prisma db push", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
}

const testEnv = { ...process.env };
if (!dbReady) {
  delete testEnv.DATABASE_URL;
}

const result = spawnSync("npx", ["vitest", "run"], {
  cwd: root,
  stdio: "inherit",
  env: testEnv,
});

process.exit(result.status ?? 1);
