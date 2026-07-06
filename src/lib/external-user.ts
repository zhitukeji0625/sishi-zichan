import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export type ExternalProfile = {
  displayName: string;
  phone?: string;
  orgCode?: string;
};

/**
 * 模拟从第三方系统拉取用户；生产可改为直连对方只读库或 API。
 */
export async function fetchExternalUserProfile(externalUserId: string): Promise<ExternalProfile> {
  const snap = await prisma.thirdPartyUserSnapshot.findUnique({
    where: { externalUserId },
  });
  if (snap) {
    try {
      return JSON.parse(snap.payloadJson) as ExternalProfile;
    } catch {
      /* fallthrough */
    }
  }
  const profile: ExternalProfile = {
    displayName: `第三方用户_${externalUserId.slice(0, 8)}`,
    phone: undefined,
    orgCode: "CO101",
  };
  await prisma.thirdPartyUserSnapshot.upsert({
    where: { externalUserId },
    create: { externalUserId, payloadJson: JSON.stringify(profile) },
    update: { payloadJson: JSON.stringify(profile), fetchedAt: new Date() },
  });
  return profile;
}

export async function upsertEndUserFromExternal(
  externalUserId: string,
  provider = "third_party",
) {
  const profile = await fetchExternalUserProfile(externalUserId);
  let orgId: string | null = null;
  if (profile.orgCode) {
    const org = await prisma.organization.findUnique({ where: { code: profile.orgCode } });
    orgId = org?.id ?? null;
  }
  const existing = await prisma.externalIdentity.findUnique({
    where: { provider_externalUserId: { provider, externalUserId } },
    include: { endUser: true },
  });
  if (existing) {
    const updateData: { name: string; phone?: string; orgId?: string } = {
      name: profile.displayName,
    };
    if (profile.phone) {
      const phoneTaken = await prisma.endUser.findFirst({
        where: { phone: profile.phone, id: { not: existing.endUserId } },
      });
      if (!phoneTaken) updateData.phone = profile.phone;
    }
    if (orgId) updateData.orgId = orgId;
    await prisma.endUser.update({
      where: { id: existing.endUserId },
      data: updateData,
    });
    return prisma.endUser.findUnique({ where: { id: existing.endUserId }, include: { org: true } });
  }
  let phone = profile.phone ?? null;
  if (!phone) {
    for (let i = 0; i < 20; i++) {
      const cand = `190${Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, "0")}`;
      const taken = await prisma.endUser.findUnique({ where: { phone: cand } });
      if (!taken) {
        phone = cand;
        break;
      }
    }
  }
  if (!phone) phone = `190${randomBytes(4).toString("hex")}`.slice(0, 11);
  const endUser = await prisma.endUser.create({
    data: {
      phone,
      name: profile.displayName,
      orgId,
      passwordHash: null,
    },
  });
  await prisma.externalIdentity.create({
    data: { provider, externalUserId, endUserId: endUser.id },
  });
  return prisma.endUser.findUnique({ where: { id: endUser.id }, include: { org: true } });
}
