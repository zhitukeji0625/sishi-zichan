import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "ADMIN_LOGIN"
  | "ASSET_CREATE"
  | "ASSET_UPDATE"
  | "ASSET_DELETE"
  | "AUCTION_CREATE"
  | "AUCTION_RESULT_GENERATE"
  | "AUCTION_RESULT_REVIEW"
  | "REGISTRATION_REVIEW"
  | "ANNOUNCEMENT_CREATE"
  | "ANNOUNCEMENT_DELETE"
  | "ANNOUNCEMENT_REVIEW"
  | "DRYING_REVIEW"
  | "ADMIN_CREATE"
  | "ADMIN_UPDATE"
  | "ADMIN_DISABLE"
  | "ORG_CREATE"
  | "ORG_UPDATE"
  | "CONFIG_UPDATE";

export async function writeAudit(
  adminUserId: string | null,
  action: AuditAction | string,
  detail?: string,
  ip?: string,
) {
  await prisma.auditLog.create({
    data: { adminUserId, action, detail: detail ?? null, ip: ip ?? null },
  });
}
