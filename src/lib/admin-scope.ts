import type { AdminRole } from "@prisma/client";
import { adminScopedOrgIds } from "@/lib/rbac";

export async function orgFilterForAdmin(role: AdminRole, adminOrgId: string) {
  const scope = await adminScopedOrgIds(role, adminOrgId);
  if (scope === "ALL") return {};
  return { orgId: { in: scope } };
}
