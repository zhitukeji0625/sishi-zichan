import { existsSync } from "node:fs";
import { config } from "dotenv";

config();

function defaultDatabaseUrl(): string {
  const sock = "/var/run/mysqld/mysqld.sock";
  if (existsSync(sock)) {
    return `mysql://root@localhost/sishi?socket=${encodeURIComponent(sock)}`;
  }
  return "mysql://root:root@127.0.0.1:3306/sishi";
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = defaultDatabaseUrl();
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "vitest-session-secret-vitest-session-secret";
}
if (!process.env.THIRD_PARTY_JWT_SECRET) {
  process.env.THIRD_PARTY_JWT_SECRET = "vitest-third-party-jwt-secret";
}
