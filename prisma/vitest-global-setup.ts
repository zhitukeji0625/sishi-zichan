import { execSync } from "node:child_process";
import {
  DEFAULT_TEST_DATABASE_URL,
  isMysqlReachable,
  parseMysqlUrl,
} from "./vitest-db";

process.env.DATABASE_URL ??= DEFAULT_TEST_DATABASE_URL;

export default async function vitestGlobalSetup() {
  const target = parseMysqlUrl(process.env.DATABASE_URL ?? "");
  if (!target) {
    console.warn(
      "[vitest] 跳过 prisma db push：无法解析 DATABASE_URL",
    );
    return;
  }
  const ok = await isMysqlReachable(target.host, target.port);
  if (!ok) {
    console.warn(
      `[vitest] 数据库 ${target.host}:${target.port} 不可达，集成测试将被跳过。` +
        " 可执行 `docker compose up -d mysql` 后重试。",
    );
    return;
  }
  execSync("npx prisma db push", {
    stdio: "inherit",
    env: process.env,
  });
}
