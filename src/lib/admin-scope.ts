import type { AdminRole, Prisma } from "@prisma/client";
import { adminScopedOrgIds } from "@/lib/rbac";

export async function orgFilterForAdmin(role: AdminRole, adminOrgId: string) {
  const scope = await adminScopedOrgIds(role, adminOrgId);
  if (scope === "ALL") return {};
  return { orgId: { in: scope } };
}

/** 连队管理员按承租用户所属组织筛选报名；团级及以上按资产所属组织筛选 */
export function registrationFilterForAdmin(
  role: AdminRole,
  orgWhere: { orgId?: { in: string[] } },
): Prisma.AuctionRegistrationWhereInput {
  if (!orgWhere.orgId) return {};
  if (role === "COMPANY_ADMIN") {
    return { endUser: orgWhere };
  }
  return { project: { asset: orgWhere } };
}
