#!/usr/bin/env node
/**
 * Functional smoke test against running dev server.
 * Usage: node scripts/functional-test.mjs
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
}

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

async function ensureLiveAuction() {
  let project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { registrations: true },
  });
  if (project) return project;

  const asset = await prisma.asset.findFirst();
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!asset || !demoUser) throw new Error("Missing seed data");

  project = await prisma.auctionProject.create({
    data: {
      code: `TEST${Date.now()}`,
      assetId: asset.id,
      startPrice: new Decimal(1000),
      bidStep: new Decimal(100),
      depositAmount: new Decimal(200),
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 7 * 86400000),
      status: "LIVE",
      registrations: {
        create: {
          endUserId: demoUser.id,
          status: "APPROVED",
          depositPaid: true,
        },
      },
    },
    include: { registrations: true },
  });
  return project;
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  // Pages
  for (const [name, path] of [
    ["首页", "/"],
    ["管理登录", "/admin/login"],
    ["H5首页", "/m"],
    ["H5竞拍", "/m/auction"],
    ["H5晒场", "/m/drying"],
  ]) {
    const res = await fetch(`${BASE}${path}`);
    record(`页面 ${name}`, res.status === 200, `HTTP ${res.status}`);
  }

  // User login
  const userLogin = await jsonFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const userCookie = userLogin.headers.get("set-cookie")?.split(";")[0] ?? "";
  record("用户登录", userLogin.body?.ok === true, JSON.stringify(userLogin.body));

  // Admin login
  const adminLogin = await jsonFetch("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookie = adminLogin.headers.get("set-cookie")?.split(";")[0] ?? "";
  record("管理员登录", adminLogin.body?.ok === true);

  // Third-party token + SSO
  const tokenRes = await jsonFetch("/api/dev/third-party-token?u_id=func_test_user");
  const token = tokenRes.body?.token;
  record("第三方 token", !!token);
  if (token) {
    const sso = await jsonFetch("/api/auth/third-party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    record("第三方 SSO", sso.body?.ok === true);
  }

  // Register new user
  const newPhone = `139${String(Date.now()).slice(-8)}`;
  const reg = await jsonFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: newPhone, password: "test1234", name: "功能测试" }),
  });
  record("用户注册", reg.body?.ok === true, newPhone);

  // Auction bid
  const project = await ensureLiveAuction();
  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const minBid = topBid
    ? Number(topBid.amount) + Number(project.bidStep)
    : Number(project.startPrice);
  const bid = await jsonFetch(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookie },
    body: JSON.stringify({ amount: minBid }),
  });
  record("竞拍出价", bid.body?.ok === true, JSON.stringify(bid.body));

  // Invalid bid
  const badBid = await jsonFetch(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookie },
    body: JSON.stringify({ amount: minBid + Number(project.bidStep) / 2 }),
  });
  record("无效出价拒绝", badBid.status === 400 && !!badBid.body?.error);

  // Drying reservation
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const reserve = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    record("晒场预约", reserve.body?.ok === true, JSON.stringify(reserve.body));
  } else {
    record("晒场预约", false, "无运营晒场");
  }

  // Mock payment - auction deposit on new project
  const depositProject = await prisma.auctionProject.create({
    data: {
      code: `DEP${Date.now()}`,
      assetId: project.assetId,
      startPrice: new Decimal(500),
      bidStep: new Decimal(50),
      depositAmount: new Decimal(100),
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 8 * 86400000),
      status: "SCHEDULED",
    },
  });
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  await prisma.auctionRegistration.create({
    data: {
      projectId: depositProject.id,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: false,
    },
  });
  const pay = await jsonFetch("/api/m/payments/mock", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookie },
    body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: depositProject.id }),
  });
  record("模拟支付保证金", pay.body?.ok === true, JSON.stringify(pay.body));

  // Admin protected page
  const adminAssets = await fetch(`${BASE}/admin/assets`, {
    headers: { Cookie: adminCookie },
  });
  record("管理后台资产页", adminAssets.status === 200, `HTTP ${adminAssets.status}`);

  // Admin API - create asset (POST only)
  const org = await prisma.organization.findFirst({ where: { code: "DIV1" } });
  if (org && adminCookie) {
    const fd = new FormData();
    fd.append("orgId", org.id);
    fd.append("type", "LAND");
    fd.append("name", `冒烟测试资产${Date.now()}`);
    fd.append("locationText", "测试");
    fd.append("status", "IDLE");
    const createAsset = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: fd,
    });
    const createBody = await createAsset.json().catch(() => null);
    record("管理 API 创建资产", createAsset.status === 200 && createBody?.ok === true);
    if (createBody?.ok) {
      const created = await prisma.asset.findFirst({
        where: { name: { startsWith: "冒烟测试资产" } },
        orderBy: { createdAt: "desc" },
      });
      if (created) await prisma.asset.delete({ where: { id: created.id } });
    }
  } else {
    record("管理 API 创建资产", false, "缺少组织或登录 Cookie");
  }

  // Cleanup test project
  await prisma.auctionBid.deleteMany({ where: { projectId: depositProject.id } });
  await prisma.auctionRegistration.deleteMany({ where: { projectId: depositProject.id } });
  await prisma.payment.deleteMany({ where: { auctionProjectId: depositProject.id } });
  await prisma.auctionProject.delete({ where: { id: depositProject.id } });

  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
