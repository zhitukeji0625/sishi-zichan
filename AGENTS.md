# AGENTS.md

## Cursor Cloud specific instructions

### Project overview
四师资产租赁平台 (Sishi Asset Rental Platform) — a Next.js 15 + MySQL/MariaDB (Prisma ORM) full-stack app with a mobile H5 frontend, admin dashboard, and REST API. Single `package.json`, no monorepo.

### Services

| Service | How to start | Default URL |
|---------|-------------|-------------|
| MariaDB | `sudo mariadbd --user=mysql --datadir=/var/lib/mysql --socket=/run/mysqld/mysqld.sock --port=3306 &` | `127.0.0.1:3306` |
| Next.js dev server | `npm run dev` | `http://localhost:3000` |

### Database setup
After starting MariaDB, if the `sishi` database doesn't exist:
```
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS sishi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'user'@'127.0.0.1' IDENTIFIED BY 'password'; GRANT ALL PRIVILEGES ON sishi.* TO 'user'@'127.0.0.1'; FLUSH PRIVILEGES;"
npx prisma db push
npm run db:seed
```

### Standard commands (see `package.json` scripts)
- **Dev server**: `npm run dev`
- **Tests**: `npm run test` (vitest)
- **Lint**: `npm run lint` — currently broken due to ESLint 9 + `eslint-config-next` incompatibility (documented in README); build skips lint via `next.config.ts` `eslint.ignoreDuringBuilds: true`
- **Build**: `npm run build`
- **DB push**: `npm run db:push` (Prisma schema → DB)
- **DB seed**: `npm run db:seed` (creates demo accounts)

### Demo accounts (from seed data)
- Admin (师级): `13900000001` / `admin123`
- Admin (团级): `13900000002` / `admin123`
- Admin (连级): `13900000003` / `admin123`
- End user: `13800138000` / `user123`

### Gotchas
- The `.env` file is created from `.env.example` and should point `DATABASE_URL` to the local MariaDB. Default: `mysql://user:password@127.0.0.1:3306/sishi`.
- MariaDB must be started manually in the Cloud Agent VM — it does not auto-start (no systemd). Use the command from the Services table above.
- Prisma generates the client in `node_modules/@prisma/client`. If you see Prisma client errors after `npm install`, run `npx prisma generate`.
