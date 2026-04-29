import { config } from "dotenv";
import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { integrationDbFlagPath } from "./src/lib/__tests__/integration-env";

export default async function globalSetup() {
  const root = process.cwd();
  const envPath = existsSync(resolve(root, ".env"))
    ? resolve(root, ".env")
    : resolve(root, ".env.example");
  config({ path: envPath });

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    writeFileSync(integrationDbFlagPath, "1", "utf8");
  } catch {
    writeFileSync(integrationDbFlagPath, "0", "utf8");
    // eslint-disable-next-line no-console
    console.warn(
      "[vitest] 无法在 DATABASE_URL 连接数据库，将跳过 placeBid 集成测试（单元测试仍会运行）。",
    );
  } finally {
    await prisma.$disconnect();
  }
}
