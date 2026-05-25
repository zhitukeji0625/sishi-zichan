#!/bin/sh
# 与 vitest.config.ts、AGENTS.md 中本地 Docker MariaDB 默认一致（未设置 DATABASE_URL 时）
export DATABASE_URL="${DATABASE_URL:-mysql://root:root@127.0.0.1:3306/sishi}"
exec "$@"
