import { prisma } from "@/lib/prisma";

export async function organizationExists(orgId: string): Promise<boolean> {
  const count = await prisma.organization.count({ where: { id: orgId } });
  return count > 0;
}
