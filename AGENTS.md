# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a Next.js 15 asset leasing & auction platform (四师资产租赁) with MySQL/MariaDB via Prisma ORM. Single-package app (not a monorepo). See `README.md` for full setup and demo accounts.

### Services

| Service | How to start | Notes |
|---------|-------------|-------|
| MariaDB 11 | `sudo docker start mariadb` (already created) | Exposed on `127.0.0.1:3306`, root/root |
| Next.js dev server | `npm run dev` | Runs on `http://localhost:3000` |

### Database

- Schema push: `npx prisma db push`
- Seed: `npm run db:seed`
- Studio: `npm run db:studio`

If the MariaDB container doesn't exist yet, create it:
```
sudo nohup dockerd > /tmp/dockerd.log 2>&1 &
sleep 5
sudo docker run -d --name mariadb -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=sishi -p 3306:3306 mariadb:11 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
```

### Lint

`next lint` / `npx eslint` does NOT work out of the box due to a known ESLint 9 vs `eslint-config-next` compatibility issue. The README states: "构建阶段已跳过 ESLint". This is a known limitation.

### Testing

- `npm run test` — runs Vitest (integration tests in `src/lib/__tests__/`, require MySQL/MariaDB)
- If the database is unreachable, DB-backed tests are **skipped** and the command still exits 0. Set `VITEST_REQUIRE_DB=1` to fail fast when the DB is required (for example in CI).
- Default test `DATABASE_URL` when `.env` is missing: `mysql://root:root@127.0.0.1:3306/sishi` (see `vitest.config.ts`).

### Demo accounts (from seed data)

- Division admin: `13900000001` / `admin123` (师级，全权限)
- Regiment admin: `13900000002` / `admin123` (团级)
- Company admin: `13900000003` / `admin123` (连队级)
- Tenant user: `13800138000` / `user123`

### Architecture notes

- `src/middleware.ts` protects `/admin/**` and `/api/m/**` routes via cookie checks
- All admin mutations are audit-logged via `writeAudit()` in `src/lib/audit.ts`
- Mock payment routes enforce server-side amounts and idempotency
- Contract HTML templates escape user data to prevent XSS

### Environment variables

Copy `.env.example` to `.env`. For local dev with Docker MariaDB, set `DATABASE_URL="mysql://root:root@127.0.0.1:3306/sishi"`.

### Gotchas

- Docker daemon must be started manually: `sudo nohup dockerd > /tmp/dockerd.log 2>&1 &`
- Docker in this VM requires `fuse-overlayfs` storage driver and `iptables-legacy` (already configured in `/etc/docker/daemon.json`).
- The `.env` file is gitignored. You must create it from `.env.example` if it doesn't exist.
- The `prisma` `package.json#prisma` config is deprecated but functional; Prisma may warn about it.
