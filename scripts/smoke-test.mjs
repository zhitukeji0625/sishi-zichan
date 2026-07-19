#!/usr/bin/env node
/**
 * 功能冒烟测试 — 覆盖主要 API 与页面可达性
 * 用法: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000";

const USER = { phone: "13800138000", password: "user123" };
const ADMIN = { phone: "13900000001", password: "admin123" };

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  const msg = `${name}: ${detail}`;
  errors.push(msg);
  console.error(`  ✗ ${msg}`);
}

function extractCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const map = new Map();
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) map.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return map;
}

function cookieHeader(cookies) {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchJson(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* html or empty */
  }
  return { res, json, text };
}

async function testPublicPages() {
  console.log("\n[公共页面]");
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    try {
      const { res } = await fetchJson(path);
      if (res.ok || res.status === 307 || res.status === 308) ok(`GET ${path}`);
      else fail(`GET ${path}`, `status ${res.status}`);
    } catch (e) {
      fail(`GET ${path}`, e.message);
    }
  }
}

async function testUserAuth() {
  console.log("\n[用户鉴权]");
  let userCookies = new Map();

  const bad = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "", password: "" }),
  });
  if (bad.res.status === 400) ok("登录空参数返回 400");
  else fail("登录空参数", `status ${bad.res.status}`);

  const login = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(USER),
  });
  if (login.res.ok && login.json?.ok) {
    ok("用户登录成功");
    userCookies = extractCookies(login.res);
  } else {
    fail("用户登录", login.json?.error || login.res.status);
    return userCookies;
  }

  const noAuth = await fetchJson("/api/m/auction/fake/bid", { method: "POST" });
  if (noAuth.res.status === 401) ok("未登录出价返回 401");
  else fail("未登录出价", `status ${noAuth.res.status}`);

  return userCookies;
}

async function testAdminAuth() {
  console.log("\n[管理员鉴权]");
  let adminCookies = new Map();

  const login = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  });
  if (login.res.ok && login.json?.ok) {
    ok("管理员登录成功");
    adminCookies = extractCookies(login.res);
  } else {
    fail("管理员登录", login.json?.error || login.res.status);
  }

  const adminPage = await fetchJson("/admin/assets", {
    headers: { Cookie: cookieHeader(adminCookies) },
    redirect: "manual",
  });
  if (adminPage.res.ok) ok("管理员可访问 /admin/assets");
  else fail("管理员访问资产页", `status ${adminPage.res.status}`);

  return adminCookies;
}

async function testUploadValidation(adminCookies) {
  console.log("\n[上传校验]");
  const noMultipart = await fetchJson("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ file: "x" }),
  });
  if (noMultipart.res.status === 400) ok("非 multipart 上传返回 400");
  else fail("非 multipart 上传", `status ${noMultipart.res.status}`);
}

async function testAuctionFlow(userCookies) {
  console.log("\n[竞拍流程]");

  const list = await fetchJson("/m/auction", {
    headers: { Cookie: cookieHeader(userCookies) },
  });
  if (list.res.ok && list.text.includes("资产竞拍")) ok("竞拍列表页可访问");
  else fail("竞拍列表页", `status ${list.res.status}`);

  if (!list.text.includes("进行中") && !list.text.includes("LIVE")) {
    fail("竞拍状态中文", "页面未显示「进行中」标签（字典可能缺失）");
  } else {
    ok("竞拍状态显示中文标签");
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let project;
  let topBid;
  try {
    project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (project) {
      topBid = await prisma.auctionBid.findFirst({
        where: { projectId: project.id },
        orderBy: { amount: "desc" },
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  if (!project) {
    fail("LIVE 竞拍项目", "数据库中无进行中项目");
    return;
  }
  ok(`找到 LIVE 项目 ${project.code}`);

  const detail = await fetchJson(`/m/auction/${project.id}`, {
    headers: { Cookie: cookieHeader(userCookies) },
  });
  if (detail.res.ok) ok("竞拍详情页可访问");
  else fail("竞拍详情页", `status ${detail.res.status}`);

  const bidStep = Number(project.bidStep);
  const minBid = topBid
    ? Number(topBid.amount) + bidStep
    : Number(project.startPrice);

  const bid = await fetchJson(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(userCookies) },
    body: JSON.stringify({ amount: minBid }),
  });
  if (bid.res.ok && bid.json?.ok) ok(`出价 ${minBid} 成功`);
  else fail("出价", bid.json?.error || bid.res.status);

  const bid2 = await fetchJson(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(userCookies) },
    body: JSON.stringify({ amount: minBid + bidStep }),
  });
  if (bid2.res.ok && bid2.json?.ok) ok("加价出价成功");
  else fail("加价出价", bid2.json?.error || bid2.res.status);
}

async function testDryingFlow(userCookies) {
  console.log("\n[晒场流程]");

  const list = await fetchJson("/m/drying", {
    headers: { Cookie: cookieHeader(userCookies) },
  });
  if (list.res.ok) ok("晒场列表页可访问");
  else fail("晒场列表页", `status ${list.res.status}`);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let listing;
  try {
    listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
  } finally {
    await prisma.$disconnect();
  }
  if (!listing) {
    fail("运营中晒场", "数据库中无 OPERATING 晒场");
    return;
  }
  ok("找到运营中晒场");

  const start = new Date();
  start.setDate(start.getDate() + 3);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const reserve = await fetchJson("/api/m/drying/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(userCookies) },
    body: JSON.stringify({
      listingId: listing.id,
      startDate: fmt(start),
      endDate: fmt(end),
    }),
  });
  if (reserve.res.ok && reserve.json?.ok) ok("晒场预约提交成功");
  else if (reserve.res.status === 409) ok("晒场重复预约返回 409");
  else fail("晒场预约", reserve.json?.error || reserve.res.status);
}

async function testPayments(userCookies) {
  console.log("\n[支付流程]");

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let project;
  try {
    project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
    });
  } finally {
    await prisma.$disconnect();
  }

  if (!project) {
    fail("支付测试前置", "缺少项目");
    return;
  }

  const dup = await fetchJson("/api/m/payments/mock", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(userCookies) },
    body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
  });
  if (dup.res.status === 409) ok("重复缴保证金返回 409");
  else if (dup.res.ok) ok("保证金缴纳成功");
  else fail("保证金缴纳", dup.json?.error || dup.res.status);
}

async function testDict() {
  console.log("\n[数据字典]");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const count = await prisma.dictCategory.count();
    if (count >= 14) ok(`字典分类 ${count} 个`);
    else fail("字典分类", `仅 ${count} 个，期望 >= 14`);

    const live = await prisma.dictItem.findFirst({
      where: { value: "LIVE", category: { code: "auction_status" } },
    });
    if (live?.label === "进行中") ok("auction_status.LIVE = 进行中");
    else fail("auction_status.LIVE", live?.label || "未找到");
  } finally {
    await prisma.$disconnect();
  }
}

async function testDevToken() {
  console.log("\n[开发工具]");
  const { res, json } = await fetchJson("/api/dev/third-party-token");
  if (res.ok && json?.token) ok("第三方 SSO token 可生成");
  else if (res.status === 404) {
    fail(
      "第三方 SSO token",
      "开发路由不可用（build 后需 rm -rf .next 并以 NODE_ENV=development 重启 dev server）"
    );
  } else fail("第三方 SSO token", json?.error || res.status);
}

async function main() {
  console.log(`Smoke test @ ${BASE}`);
  try {
    await fetch(BASE);
  } catch (e) {
    console.error(`无法连接 ${BASE}: ${e.message}`);
    process.exit(1);
  }

  await testPublicPages();
  const userCookies = await testUserAuth();
  const adminCookies = await testAdminAuth();
  if (adminCookies.size > 0) await testUploadValidation(adminCookies);
  if (userCookies.size > 0) {
    await testAuctionFlow(userCookies);
    await testDryingFlow(userCookies);
    await testPayments(userCookies);
  }
  await testDict();
  await testDevToken();

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (errors.length) {
    console.log("\n失败详情:");
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }
  console.log("全部通过 ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
