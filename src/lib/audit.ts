import { prisma } from "@/lib/prisma";

export async function writeAudit(adminUserId: string | null, action: string, detail?: string, ip?: string) {
  await prisma.auditLog.create({
    data: { adminUserId, action, detail: detail ?? null, ip: ip ?? null },
  });
}
