#!/usr/bin/env node
/**
 * 与 vitest.config.ts 一致：未设置 DATABASE_URL 时使用本地 Docker MariaDB 默认值，
 * 便于尚未复制 .env 时运行 prisma / seed。
 */
const { spawnSync } = require("node:child_process");

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    "mysql://root:root@127.0.0.1:3306/sishi";
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("用法: node scripts/with-database-url.cjs <命令> [参数...]");
  process.exit(1);
}

const [cmd, ...args] = argv;
const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
if (r.error) {
  console.error(r.error);
  process.exit(1);
}
process.exit(r.status ?? 0);
