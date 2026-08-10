import { PrismaClient, AdminRole, OrgLevel, AssetType, AssetStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function ensureDemoAuction(regId: string, demoUserId: string) {
  let asset = await prisma.asset.findFirst({
    where: { name: "团部东侧闲置地块", orgId: regId },
  });
  if (!asset) {
    asset = await prisma.asset.create({
      data: {
        orgId: regId,
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
  }

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  let project = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id, status: "LIVE" },
  });
  if (!project) {
    const stale = await prisma.auctionProject.findFirst({
      where: { assetId: asset.id },
      orderBy: { createdAt: "desc" },
    });
    if (stale) {
      project = await prisma.auctionProject.update({
        where: { id: stale.id },
        data: { status: "LIVE", startsAt: starts, endsAt: ends },
      });
    } else {
      project = await prisma.auctionProject.create({
        data: {
          code: `AP${Date.now()}`,
          assetId: asset.id,
          startPrice: 8000,
          bidStep: 200,
          startsAt: starts,
          endsAt: ends,
          depositAmount: 500,
          status: "LIVE",
        },
      });
    }
  } else if (project.endsAt < new Date()) {
    project = await prisma.auctionProject.update({
      where: { id: project.id },
      data: { startsAt: starts, endsAt: ends },
    });
  }

  await prisma.auctionRegistration.upsert({
    where: {
      projectId_endUserId: { projectId: project.id, endUserId: demoUserId },
    },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: project.id,
      endUserId: demoUserId,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}

async function main() {
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
  const demoUser = await prisma.endUser.upsert({
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

  const dryingAsset = await prisma.asset.findFirst({
    where: { name: "一连晒场 A 区", orgId: co.id },
  });
  if (!dryingAsset) {
    const created = await prisma.asset.create({
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
        assetId: created.id,
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
  }

  await ensureDemoAuction(reg.id, demoUser.id);

  const announcementCount = await prisma.announcement.count();
  if (announcementCount === 0) {
    await prisma.announcement.create({
      data: {
        orgId: reg.id,
        title: "春季资产竞拍公告",
        content: "<p>欢迎参与本轮竞拍，详见各项目说明。</p>",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
  }

  const templateCount = await prisma.contractTemplate.count();
  if (templateCount === 0) {
    await prisma.contractTemplate.create({
      data: {
        name: "竞拍租赁合同（示例）",
        type: "AUCTION_LEASE",
        bodyHtml:
          "<p>甲方：{{orgName}}</p><p>乙方：{{userName}}</p><p>标的：{{assetName}}</p><p>租期：{{leaseTerm}}</p>",
        active: true,
      },
    });
  }

  const msgTemplateCount = await prisma.messageTemplate.count();
  if (msgTemplateCount === 0) {
    await prisma.messageTemplate.create({
      data: {
        code: "REG_RESULT",
        title: "报名审核结果",
        body: "您的报名已{{status}}。",
        channel: "IN_APP",
      },
    });
  }

  console.log("Seed OK. Admin: 13900000001 / admin123. User: 13800138000 / user123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
