import { PrismaClient } from "@prisma/client";

const CONNECT_TIMEOUT_MS = 2500;

/** True when DATABASE_URL is set and MySQL accepts a query within the timeout. */
export async function isIntegrationDbAvailable(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;

  const prisma = new PrismaClient();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("connect-timeout")), CONNECT_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
