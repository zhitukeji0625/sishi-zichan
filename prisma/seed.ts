import { PrismaClient, AdminRole, OrgLevel, AssetType, AssetStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** 与 Prisma 枚举及前端 getDict* 使用的 categoryCode 对齐；每次 seed 执行均 upsert，补全新库或升级后的字典表。 */
async function seedBuiltInDicts() {
  const categories: Array<{
    code: string;
    name: string;
    description?: string;
    items: Array<{ value: string; label: string; sortOrder: number }>;
  }> = [
    {
      code: "asset_type",
      name: "资产类型",
      items: [
        { value: "WORKSHOP", label: "厂房/车间", sortOrder: 0 },
        { value: "MACHINERY", label: "农业机械", sortOrder: 1 },
        { value: "FACILITY", label: "设施用房", sortOrder: 2 },
        { value: "LAND", label: "耕地/地块", sortOrder: 3 },
        { value: "DRYING_FIELD", label: "晒场", sortOrder: 4 },
        { value: "OTHER", label: "其他", sortOrder: 5 },
      ],
    },
    {
      code: "asset_status",
      name: "资产状态",
      items: [
        { value: "IDLE", label: "闲置", sortOrder: 0 },
        { value: "IN_USE", label: "使用中", sortOrder: 1 },
        { value: "MAINTENANCE", label: "维护中", sortOrder: 2 },
      ],
    },
    {
      code: "org_level",
      name: "组织层级",
      items: [
        { value: "DIVISION", label: "师级", sortOrder: 0 },
        { value: "REGIMENT", label: "团级", sortOrder: 1 },
        { value: "COMPANY", label: "连队级", sortOrder: 2 },
      ],
    },
    {
      code: "admin_role",
      name: "管理员角色",
      items: [
        { value: "DIVISION_ADMIN", label: "师管理员", sortOrder: 0 },
        { value: "REGIMENT_ADMIN", label: "团管理员", sortOrder: 1 },
        { value: "COMPANY_ADMIN", label: "连管理员", sortOrder: 2 },
      ],
    },
    {
      code: "announcement_status",
      name: "公告状态",
      items: [
        { value: "DRAFT", label: "草稿", sortOrder: 0 },
        { value: "PENDING_REVIEW", label: "待审核", sortOrder: 1 },
        { value: "PUBLISHED", label: "已发布", sortOrder: 2 },
        { value: "WITHDRAWN", label: "已撤回", sortOrder: 3 },
      ],
    },
    {
      code: "registration_status",
      name: "报名审核状态",
      items: [
        { value: "PENDING", label: "待审核", sortOrder: 0 },
        { value: "APPROVED", label: "已通过", sortOrder: 1 },
        { value: "REJECTED", label: "已拒绝", sortOrder: 2 },
      ],
    },
    {
      code: "auction_status",
      name: "竞拍项目状态",
      items: [
        { value: "DRAFT", label: "草稿", sortOrder: 0 },
        { value: "SCHEDULED", label: "已排期", sortOrder: 1 },
        { value: "LIVE", label: "竞拍中", sortOrder: 2 },
        { value: "ENDED", label: "已结束", sortOrder: 3 },
        { value: "CANCELLED", label: "已取消", sortOrder: 4 },
      ],
    },
    {
      code: "drying_listing_status",
      name: "晒场挂牌状态",
      items: [
        { value: "OPERATING", label: "运营中", sortOrder: 0 },
        { value: "MAINTENANCE", label: "维护中", sortOrder: 1 },
        { value: "PAUSED", label: "已暂停", sortOrder: 2 },
        { value: "OFFLINE", label: "已下线", sortOrder: 3 },
      ],
    },
    {
      code: "reservation_status",
      name: "预约/订单状态",
      items: [
        { value: "PENDING_REVIEW", label: "待审核", sortOrder: 0 },
        { value: "APPROVED", label: "已通过", sortOrder: 1 },
        { value: "REJECTED", label: "已拒绝", sortOrder: 2 },
        { value: "PENDING_PAYMENT", label: "待支付", sortOrder: 3 },
        { value: "PAID", label: "已支付", sortOrder: 4 },
        { value: "CONTRACT_PENDING", label: "待签约", sortOrder: 5 },
        { value: "ACTIVE", label: "履约中", sortOrder: 6 },
        { value: "CANCELLED", label: "已取消", sortOrder: 7 },
        { value: "COMPLETED", label: "已完成", sortOrder: 8 },
      ],
    },
    {
      code: "payment_purpose",
      name: "支付用途",
      items: [
        { value: "AUCTION_DEPOSIT", label: "竞拍保证金", sortOrder: 0 },
        { value: "AUCTION_RENT", label: "竞拍租金", sortOrder: 1 },
        { value: "DRYING_DEPOSIT", label: "晒场保证金", sortOrder: 2 },
        { value: "DRYING_RENT", label: "晒场租金", sortOrder: 3 },
      ],
    },
    {
      code: "payment_status",
      name: "支付状态",
      items: [
        { value: "PENDING", label: "待支付", sortOrder: 0 },
        { value: "SUCCESS", label: "支付成功", sortOrder: 1 },
        { value: "FAILED", label: "支付失败", sortOrder: 2 },
        { value: "REFUNDED", label: "已退款", sortOrder: 3 },
      ],
    },
  ];

  for (const cat of categories) {
    const category = await prisma.dictCategory.upsert({
      where: { code: cat.code },
      create: {
        code: cat.code,
        name: cat.name,
        description: cat.description ?? null,
        builtIn: true,
      },
      update: {
        name: cat.name,
        description: cat.description ?? undefined,
        builtIn: true,
      },
    });
    for (const item of cat.items) {
      await prisma.dictItem.upsert({
        where: {
          categoryId_value: { categoryId: category.id, value: item.value },
        },
        create: {
          categoryId: category.id,
          value: item.value,
          label: item.label,
          sortOrder: item.sortOrder,
          enabled: true,
        },
        update: {
          label: item.label,
          sortOrder: item.sortOrder,
          enabled: true,
        },
      });
    }
  }
}

async function main() {
  await seedBuiltInDicts();

  const existing = await prisma.auctionProject.count();
  if (existing > 0) {
    console.log("Seed skipped: demo data already present (built-in dicts were synced).");
    return;
  }

  const div = await prisma.organization.upsert({
    where: { code: "DIV1" },
    update: {},
    create: {
      name: "第四师",
      code: "DIV1",
      level: OrgLevel.DIVISION,
      leaderName: "师部",
      phone: "0999-0001",
    },
  });
  const reg = await prisma.organization.upsert({
    where: { code: "REG61" },
    update: {},
    create: {
      name: "六十一团",
      code: "REG61",
      level: OrgLevel.REGIMENT,
      parentId: div.id,
      leaderName: "团部",
      phone: "0999-0061",
    },
  });
  const co = await prisma.organization.upsert({
    where: { code: "CO101" },
    update: {},
    create: {
      name: "一连",
      code: "CO101",
      level: OrgLevel.COMPANY,
      parentId: reg.id,
      leaderName: "连部",
      phone: "0999-6101",
    },
  });

  const hash = await bcrypt.hash("admin123", 10);
  await prisma.adminUser.upsert({
    where: { phone: "13900000001" },
    update: {},
    create: {
      phone: "13900000001",
      passwordHash: hash,
      name: "师管理员",
      role: AdminRole.DIVISION_ADMIN,
      orgId: div.id,
    },
  });
  await prisma.adminUser.upsert({
    where: { phone: "13900000002" },
    update: {},
    create: {
      phone: "13900000002",
      passwordHash: hash,
      name: "团管理员",
      role: AdminRole.REGIMENT_ADMIN,
      orgId: reg.id,
    },
  });
  await prisma.adminUser.upsert({
    where: { phone: "13900000003" },
    update: {},
    create: {
      phone: "13900000003",
      passwordHash: hash,
      name: "连管理员",
      role: AdminRole.COMPANY_ADMIN,
      orgId: co.id,
    },
  });

  const userHash = await bcrypt.hash("user123", 10);
  await prisma.endUser.upsert({
    where: { phone: "13800138000" },
    update: {},
    create: {
      phone: "13800138000",
      passwordHash: userHash,
      name: "测试农户",
      idCard: "650101199001011234",
      orgId: co.id,
      userType: "PERSON",
      verified: true,
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: "site_name" },
    update: { value: "四师资产租赁平台" },
    create: { key: "site_name", value: "四师资产租赁平台" },
  });

  const asset1 = await prisma.asset.create({
    data: {
      orgId: reg.id,
      type: AssetType.LAND,
      name: "团部东侧闲置地块",
      locationText: "六十一团团部东侧",
      specs: "面积约 5 亩",
      description: "<p>适合种植及临时堆放，权属清晰。</p>",
      refPriceMin: 8000,
      refPriceMax: 12000,
      status: AssetStatus.IDLE,
    },
  });

  const dryingAsset = await prisma.asset.create({
    data: {
      orgId: co.id,
      type: AssetType.DRYING_FIELD,
      name: "一连晒场 A 区",
      locationText: "一连晒场",
      specs: "占地约 2000㎡",
      description: "<p>硬化地面，通水电。</p>",
      status: AssetStatus.IN_USE,
    },
  });

  await prisma.dryingFieldListing.create({
    data: {
      assetId: dryingAsset.id,
      status: "OPERATING",
      lat: 44.2,
      lng: 80.6,
      builtYear: 2018,
      capacityRules: {
        create: {
          startDate: new Date("2026-01-01"),
          endDate: new Date("2027-12-31"),
          maxPeople: 10,
        },
      },
      bookingRules: {
        create: { maxAdvanceDays: 7 },
      },
    },
  });

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const project = await prisma.auctionProject.create({
    data: {
      code: `AP${Date.now()}`,
      assetId: asset1.id,
      startPrice: 8000,
      bidStep: 200,
      startsAt: starts,
      endsAt: ends,
      depositAmount: 500,
      status: "LIVE",
    },
  });

  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (demoUser) {
    await prisma.auctionRegistration.upsert({
      where: {
        projectId_endUserId: { projectId: project.id, endUserId: demoUser.id },
      },
      update: { status: "APPROVED", depositPaid: true },
      create: {
        projectId: project.id,
        endUserId: demoUser.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });
  }

  await prisma.announcement.create({
    data: {
      orgId: reg.id,
      title: "春季资产竞拍公告",
      content: "<p>欢迎参与本轮竞拍，详见各项目说明。</p>",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  await prisma.contractTemplate.create({
    data: {
      name: "竞拍租赁合同（示例）",
      type: "AUCTION_LEASE",
      bodyHtml:
        "<p>甲方：{{orgName}}</p><p>乙方：{{userName}}</p><p>标的：{{assetName}}</p><p>租期：{{leaseTerm}}</p>",
      active: true,
    },
  });

  await prisma.messageTemplate.create({
    data: {
      code: "REG_RESULT",
      title: "报名审核结果",
      body: "您的报名已{{status}}。",
      channel: "IN_APP",
    },
  });

  console.log("Seed OK. Admin: 13900000001 / admin123. User: 13800138000 / user123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
