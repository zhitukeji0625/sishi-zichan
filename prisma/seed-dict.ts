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
  paymentPurposeLabels,
  paymentStatusLabels,
  contractTypeLabels,
  contractStatusLabels,
  endUserTypeLabels,
} from "../src/lib/labels";

const CATEGORIES: {
  code: string;
  name: string;
  labels: Record<string, string>;
}[] = [
  { code: "asset_type", name: "资产类型", labels: assetTypeLabels },
  { code: "asset_status", name: "资产状态", labels: assetStatusLabels },
  { code: "admin_role", name: "管理员角色", labels: adminRoleLabels },
  { code: "org_level", name: "组织层级", labels: orgLevelLabels },
  { code: "auction_status", name: "竞拍状态", labels: auctionStatusLabels },
  { code: "registration_status", name: "报名状态", labels: registrationStatusLabels },
  { code: "announcement_status", name: "公告状态", labels: announcementStatusLabels },
  { code: "drying_listing_status", name: "晒场状态", labels: dryingListingStatusLabels },
  { code: "reservation_status", name: "预约状态", labels: reservationStatusLabels },
  { code: "payment_purpose", name: "支付用途", labels: paymentPurposeLabels },
  { code: "payment_status", name: "支付状态", labels: paymentStatusLabels },
  { code: "contract_type", name: "合同类型", labels: contractTypeLabels },
  { code: "contract_status", name: "合同状态", labels: contractStatusLabels },
  { code: "end_user_type", name: "用户类型", labels: endUserTypeLabels },
];

export async function seedDict(prisma: PrismaClient) {
  for (const cat of CATEGORIES) {
    const category = await prisma.dictCategory.upsert({
      where: { code: cat.code },
      update: { name: cat.name },
      create: { code: cat.code, name: cat.name, builtIn: true },
    });
    let order = 0;
    for (const [value, label] of Object.entries(cat.labels)) {
      order++;
      await prisma.dictItem.upsert({
        where: { categoryId_value: { categoryId: category.id, value } },
        update: { label, sortOrder: order },
        create: { categoryId: category.id, value, label, sortOrder: order },
      });
    }
  }
}
