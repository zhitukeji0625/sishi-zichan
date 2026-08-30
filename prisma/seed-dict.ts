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
} from "../src/lib/labels";

type DictSeed = {
  code: string;
  name: string;
  description: string;
  labels: Record<string, string>;
};

const DICT_CATEGORIES: DictSeed[] = [
  { code: "org_level", name: "组织层级", description: "师/团/连", labels: orgLevelLabels },
  { code: "admin_role", name: "管理员角色", description: "后台角色", labels: adminRoleLabels },
  { code: "asset_type", name: "资产类型", description: "资产分类", labels: assetTypeLabels },
  { code: "asset_status", name: "资产状态", description: "资产使用状态", labels: assetStatusLabels },
  { code: "auction_status", name: "竞拍状态", description: "竞拍项目状态", labels: auctionStatusLabels },
  { code: "registration_status", name: "报名状态", description: "竞拍报名审核", labels: registrationStatusLabels },
  { code: "announcement_status", name: "公告状态", description: "公告发布状态", labels: announcementStatusLabels },
  {
    code: "drying_listing_status",
    name: "晒场状态",
    description: "晒场运营状态",
    labels: dryingListingStatusLabels,
  },
  { code: "reservation_status", name: "预约状态", description: "晒场预约状态", labels: reservationStatusLabels },
  { code: "payment_purpose", name: "支付用途", description: "支付类型", labels: paymentPurposeLabels },
  { code: "payment_status", name: "支付状态", description: "支付结果", labels: paymentStatusLabels },
];

export async function seedDict(prisma: PrismaClient) {
  for (const cat of DICT_CATEGORIES) {
    const category = await prisma.dictCategory.upsert({
      where: { code: cat.code },
      update: { name: cat.name, description: cat.description, builtIn: true },
      create: {
        code: cat.code,
        name: cat.name,
        description: cat.description,
        builtIn: true,
      },
    });

    const entries = Object.entries(cat.labels);
    for (let i = 0; i < entries.length; i++) {
      const [value, label] = entries[i];
      await prisma.dictItem.upsert({
        where: { categoryId_value: { categoryId: category.id, value } },
        update: { label, sortOrder: i + 1, enabled: true },
        create: { categoryId: category.id, value, label, sortOrder: i + 1, enabled: true },
      });
    }
  }
}
