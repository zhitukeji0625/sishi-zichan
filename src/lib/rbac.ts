import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getOrgSubtreeIds(rootId: string): Promise<string[]> {
  const ids: string[] = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const children = await prisma.organization.findMany({
      where: { parentId: id },
      select: { id: true },
    });
    for (const c of children) {
      ids.push(c.id);
      queue.push(c.id);
    }
  }
  return ids;
}

export function roleLabel(role: AdminRole) {
  switch (role) {
    case "DIVISION_ADMIN":
      return "师级管理员";
    case "REGIMENT_ADMIN":
      return "团级管理员";
    case "COMPANY_ADMIN":
      return "连队管理员";
    default:
      return role;
  }
}

/** Admin may manage data belonging to these org ids */
export async function adminScopedOrgIds(
  role: AdminRole,
  adminOrgId: string,
): Promise<string[] | "ALL"> {
  if (role === "DIVISION_ADMIN") return "ALL";
  return getOrgSubtreeIds(adminOrgId);
}

export async function adminCanAccessOrg(
  role: AdminRole,
  adminOrgId: string,
  targetOrgId: string,
): Promise<boolean> {
  const scope = await adminScopedOrgIds(role, adminOrgId);
  if (scope === "ALL") return true;
  return scope.includes(targetOrgId);
}

export async function organizationExists(orgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  return org !== null;
}

export function isRegimentOrAbove(role: AdminRole) {
  return role === "DIVISION_ADMIN" || role === "REGIMENT_ADMIN";
}

export function isDivision(role: AdminRole) {
  return role === "DIVISION_ADMIN";
}
