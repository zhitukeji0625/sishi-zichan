import { PrismaClient } from "@prisma/client";
import {
  assetTypeLabels,
  assetStatusLabels,
  adminRoleLabels,
  orgLevelLabels,
  auctionStatusLabels,
  registrationStatusLabels,
  announcementStatusLabels,
  dryingListingStatusLabels,
  reservationStatusLabels,
  contractTypeLabels,
  contractStatusLabels,
  paymentPurposeLabels,
  paymentStatusLabels,
  endUserTypeLabels,
} from "../src/lib/labels";

type DictSeed = { code: string; name: string; labels: Record<string, string> };

const DICT_SEEDS: DictSeed[] = [
  { code: "asset_type", name: "资产类型", labels: assetTypeLabels },
  { code: "asset_status", name: "资产状态", labels: assetStatusLabels },
  { code: "admin_role", name: "管理员角色", labels: adminRoleLabels },
  { code: "org_level", name: "组织层级", labels: orgLevelLabels },
  { code: "auction_status", name: "竞拍状态", labels: auctionStatusLabels },
  { code: "registration_status", name: "报名状态", labels: registrationStatusLabels },
  { code: "announcement_status", name: "公告状态", labels: announcementStatusLabels },
  { code: "drying_listing_status", name: "晒场状态", labels: dryingListingStatusLabels },
  { code: "reservation_status", name: "预约状态", labels: reservationStatusLabels },
  { code: "contract_type", name: "合同类型", labels: contractTypeLabels },
  { code: "contract_status", name: "合同状态", labels: contractStatusLabels },
  { code: "payment_purpose", name: "支付用途", labels: paymentPurposeLabels },
  { code: "payment_status", name: "支付状态", labels: paymentStatusLabels },
  { code: "end_user_type", name: "用户类型", labels: endUserTypeLabels },
];

export async function seedDict(prisma: PrismaClient) {
  for (const seed of DICT_SEEDS) {
    const cat = await prisma.dictCategory.upsert({
      where: { code: seed.code },
      update: { name: seed.name },
      create: { code: seed.code, name: seed.name, builtIn: true },
    });
    const entries = Object.entries(seed.labels);
    for (let i = 0; i < entries.length; i++) {
      const [value, label] = entries[i];
      await prisma.dictItem.upsert({
        where: { categoryId_value: { categoryId: cat.id, value } },
        update: { label, sortOrder: i, enabled: true },
        create: { categoryId: cat.id, value, label, sortOrder: i, enabled: true },
      });
    }
  }
}
