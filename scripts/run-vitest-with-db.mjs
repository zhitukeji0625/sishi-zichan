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
  const cmd = "docker compose -f docker-compose.test.yml up -d --wait";
  const opts = { cwd: root, stdio: "inherit" };
  try {
    execSync(cmd, opts);
    return;
  } catch {
    // 部分环境需 sudo；无 rootless Docker 时常见
  }
  try {
    execSync(`sudo ${cmd}`, opts);
    return;
  } catch {
    console.error(
      [
        "无法启动测试数据库：127.0.0.1:3307 未监听，且 docker compose 失败。",
        "请在本机安装并启动 Docker 后执行：",
        "  docker compose -f docker-compose.test.yml up -d",
        "若测试库已在运行，可设置 SKIP_DB_START=1 跳过自动拉起容器。",
      ].join("\n"),
    );
    process.exit(1);
  }
}

async function ensureMysql() {
  if (process.env.SKIP_DB_START === "1") return;
  const open = await portOpen("127.0.0.1", 3307, 2000);
  if (open) return;
  console.log("启动测试数据库 (docker compose -f docker-compose.test.yml)…");
  dockerComposeUp();
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
