import { config } from "dotenv";

config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "mysql://root:root@127.0.0.1:3306/sishi";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "vitest-session-secret-vitest-session-secret";
}
if (!process.env.THIRD_PARTY_JWT_SECRET) {
  process.env.THIRD_PARTY_JWT_SECRET = "vitest-third-party-jwt-secret";
}
