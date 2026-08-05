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

const prisma = new PrismaClient();

type DictDef = {
  code: string;
  name: string;
  description?: string;
  builtIn?: boolean;
  items: Record<string, string>;
};

const DICT_CATEGORIES: DictDef[] = [
  { code: "asset_type", name: "资产类型", builtIn: true, items: assetTypeLabels },
  { code: "asset_status", name: "资产状态", builtIn: true, items: assetStatusLabels },
  { code: "admin_role", name: "管理员角色", builtIn: true, items: adminRoleLabels },
  { code: "org_level", name: "组织层级", builtIn: true, items: orgLevelLabels },
  { code: "auction_status", name: "竞拍状态", builtIn: true, items: auctionStatusLabels },
  { code: "registration_status", name: "报名状态", builtIn: true, items: registrationStatusLabels },
  { code: "announcement_status", name: "公告状态", builtIn: true, items: announcementStatusLabels },
  { code: "drying_listing_status", name: "晒场状态", builtIn: true, items: dryingListingStatusLabels },
  { code: "reservation_status", name: "预约状态", builtIn: true, items: reservationStatusLabels },
  { code: "contract_type", name: "合同类型", builtIn: true, items: contractTypeLabels },
  { code: "contract_status", name: "合同状态", builtIn: true, items: contractStatusLabels },
  { code: "payment_purpose", name: "支付用途", builtIn: true, items: paymentPurposeLabels },
  { code: "payment_status", name: "支付状态", builtIn: true, items: paymentStatusLabels },
  { code: "end_user_type", name: "用户类型", builtIn: true, items: endUserTypeLabels },
];

/** Upsert all built-in dictionary categories and items. Safe to run repeatedly. */
export async function seedDict(client: PrismaClient = prisma) {
  for (const def of DICT_CATEGORIES) {
    const cat = await client.dictCategory.upsert({
      where: { code: def.code },
      update: { name: def.name, description: def.description ?? null, builtIn: def.builtIn ?? false },
      create: {
        code: def.code,
        name: def.name,
        description: def.description ?? null,
        builtIn: def.builtIn ?? false,
      },
    });

    let sortOrder = 1;
    for (const [value, label] of Object.entries(def.items)) {
      await client.dictItem.upsert({
        where: { categoryId_value: { categoryId: cat.id, value } },
        update: { label, sortOrder, enabled: true },
        create: { categoryId: cat.id, value, label, sortOrder, enabled: true },
      });
      sortOrder++;
    }
  }
}

if (require.main === module) {
  seedDict()
    .then(() => {
      console.log("Dict seed OK.");
      return prisma.$disconnect();
    })
    .catch((e) => {
      console.error(e);
      prisma.$disconnect();
      process.exit(1);
    });
}
