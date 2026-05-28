import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export function dbClient(tx?: DbClient): DbClient {
  return tx ?? prisma;
}
