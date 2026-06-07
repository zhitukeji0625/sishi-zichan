import { PrismaClient } from "@prisma/client";

export const dictCategories = [
  {
    code: "asset_type",
    name: "资产类型",
    description: "资产分类，如厂房、农机、土地等",
    builtIn: true,
    items: [
      { value: "WORKSHOP", label: "厂房", sortOrder: 1 },
      { value: "MACHINERY", label: "农机设备", sortOrder: 2 },
      { value: "FACILITY", label: "农业设施", sortOrder: 3 },
      { value: "LAND", label: "闲置土地", sortOrder: 4 },
      { value: "DRYING_FIELD", label: "晒场", sortOrder: 5 },
      { value: "OTHER", label: "其他", sortOrder: 6 },
    ],
  },
  {
    code: "asset_status",
    name: "资产状态",
    description: "资产当前使用状态",
    builtIn: true,
    items: [
      { value: "IDLE", label: "闲置", sortOrder: 1 },
      { value: "IN_USE", label: "在用", sortOrder: 2 },
      { value: "MAINTENANCE", label: "维护中", sortOrder: 3 },
    ],
  },
  {
    code: "auction_status",
    name: "竞拍状态",
    description: "竞拍项目状态",
    builtIn: true,
    items: [
      { value: "DRAFT", label: "草稿", sortOrder: 1 },
      { value: "SCHEDULED", label: "待开始", sortOrder: 2 },
      { value: "LIVE", label: "进行中", sortOrder: 3 },
      { value: "ENDED", label: "已结束", sortOrder: 4 },
      { value: "CANCELLED", label: "已取消", sortOrder: 5 },
    ],
  },
  {
    code: "registration_status",
    name: "报名状态",
    description: "竞拍报名审核状态",
    builtIn: true,
    items: [
      { value: "PENDING", label: "待审核", sortOrder: 1 },
      { value: "APPROVED", label: "已通过", sortOrder: 2 },
      { value: "REJECTED", label: "已驳回", sortOrder: 3 },
    ],
  },
  {
    code: "announcement_status",
    name: "公告状态",
    builtIn: true,
    items: [
      { value: "DRAFT", label: "草稿", sortOrder: 1 },
      { value: "PENDING_REVIEW", label: "待审核", sortOrder: 2 },
      { value: "PUBLISHED", label: "已发布", sortOrder: 3 },
      { value: "WITHDRAWN", label: "已撤回", sortOrder: 4 },
    ],
  },
  {
    code: "drying_listing_status",
    name: "晒场上架状态",
    builtIn: true,
    items: [
      { value: "OPERATING", label: "运营中", sortOrder: 1 },
      { value: "MAINTENANCE", label: "维护中", sortOrder: 2 },
      { value: "PAUSED", label: "已暂停", sortOrder: 3 },
      { value: "OFFLINE", label: "已下线", sortOrder: 4 },
    ],
  },
  {
    code: "reservation_status",
    name: "预约状态",
    builtIn: true,
    items: [
      { value: "PENDING_REVIEW", label: "待审核", sortOrder: 1 },
      { value: "APPROVED", label: "已通过", sortOrder: 2 },
      { value: "REJECTED", label: "已驳回", sortOrder: 3 },
      { value: "PENDING_PAYMENT", label: "待支付", sortOrder: 4 },
      { value: "PAID", label: "已支付", sortOrder: 5 },
      { value: "CONTRACT_PENDING", label: "待签合同", sortOrder: 6 },
      { value: "ACTIVE", label: "使用中", sortOrder: 7 },
      { value: "CANCELLED", label: "已取消", sortOrder: 8 },
      { value: "COMPLETED", label: "已完成", sortOrder: 9 },
    ],
  },
  {
    code: "contract_type",
    name: "合同类型",
    builtIn: true,
    items: [
      { value: "AUCTION_LEASE", label: "竞拍租赁", sortOrder: 1 },
      { value: "DRYING_LEASE", label: "晒场租赁", sortOrder: 2 },
    ],
  },
  {
    code: "contract_status",
    name: "合同状态",
    builtIn: true,
    items: [
      { value: "DRAFT", label: "待签署", sortOrder: 1 },
      { value: "SIGNED", label: "已签署", sortOrder: 2 },
      { value: "EXPIRED", label: "已过期", sortOrder: 3 },
    ],
  },
  {
    code: "payment_purpose",
    name: "支付用途",
    builtIn: true,
    items: [
      { value: "AUCTION_DEPOSIT", label: "竞拍保证金", sortOrder: 1 },
      { value: "AUCTION_RENT", label: "竞拍租金", sortOrder: 2 },
      { value: "DRYING_DEPOSIT", label: "晒场保证金", sortOrder: 3 },
      { value: "DRYING_RENT", label: "晒场租金", sortOrder: 4 },
    ],
  },
  {
    code: "payment_status",
    name: "支付状态",
    builtIn: true,
    items: [
      { value: "PENDING", label: "待支付", sortOrder: 1 },
      { value: "SUCCESS", label: "成功", sortOrder: 2 },
      { value: "FAILED", label: "失败", sortOrder: 3 },
      { value: "REFUNDED", label: "已退款", sortOrder: 4 },
    ],
  },
  {
    code: "org_level",
    name: "组织级别",
    builtIn: true,
    items: [
      { value: "DIVISION", label: "师", sortOrder: 1 },
      { value: "REGIMENT", label: "团", sortOrder: 2 },
      { value: "COMPANY", label: "连", sortOrder: 3 },
    ],
  },
  {
    code: "admin_role",
    name: "管理员角色",
    builtIn: true,
    items: [
      { value: "DIVISION_ADMIN", label: "师级管理员", sortOrder: 1 },
      { value: "REGIMENT_ADMIN", label: "团级管理员", sortOrder: 2 },
      { value: "COMPANY_ADMIN", label: "连队管理员", sortOrder: 3 },
    ],
  },
  {
    code: "user_type",
    name: "用户类型",
    builtIn: true,
    items: [
      { value: "PERSON", label: "个人", sortOrder: 1 },
      { value: "COMPANY", label: "企业", sortOrder: 2 },
    ],
  },
] as const;

/** Idempotent seed for built-in dictionary categories. */
export async function seedDict(prisma: PrismaClient) {
  for (const cat of dictCategories) {
    const existing = await prisma.dictCategory.findUnique({ where: { code: cat.code } });
    if (existing) {
      console.log(`  Dict skip: ${cat.code} (already exists)`);
      continue;
    }
    await prisma.dictCategory.create({
      data: {
        code: cat.code,
        name: cat.name,
        description: "description" in cat ? (cat.description ?? null) : null,
        builtIn: cat.builtIn,
        items: { create: [...cat.items] },
      },
    });
    console.log(`  Dict created: ${cat.code} (${cat.items.length} items)`);
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed-dict.ts");

if (isDirectRun) {
  const prisma = new PrismaClient();
  seedDict(prisma)
    .then(() => {
      console.log("Dict seed done.");
      return prisma.$disconnect();
    })
    .catch((e) => {
      console.error(e);
      prisma.$disconnect();
      process.exit(1);
    });
}
