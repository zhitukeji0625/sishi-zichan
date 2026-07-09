#!/usr/bin/env node
/**
 * 冒烟测试：需先 npm run build && npm start
 * 用法: node scripts/smoke-test.mjs [BASE_URL]
 */
const BASE = process.argv[2] || "http://localhost:3000";

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
  console.log(`  ✗ ${msg}`);
}

async function req(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, { redirect: "manual", ...opts });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { res, text, json };
}

function getCookie(res, name) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function loginUser() {
  const { res, json } = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  if (res.status !== 200 || !json?.ok) {
    fail("用户登录", `status=${res.status} body=${JSON.stringify(json)}`);
    return null;
  }
  const cookie = getCookie(res, "sishi_user_session");
  if (!cookie) {
    fail("用户登录 Cookie", "未设置 sishi_user_session");
    return null;
  }
  ok("用户登录");
  return cookie;
}

async function loginAdmin() {
  const { res, json } = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  if (res.status !== 200 || !json?.ok) {
    fail("管理员登录", `status=${res.status} body=${JSON.stringify(json)}`);
    return null;
  }
  const cookie = getCookie(res, "sishi_admin_session");
  if (!cookie) {
    fail("管理员登录 Cookie", "未设置 sishi_admin_session");
    return null;
  }
  ok("管理员登录");
  return cookie;
}

async function testPages() {
  console.log("\n[页面]");
  const pages = ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"];
  for (const p of pages) {
    const { res } = await req(p);
    if (res.status === 200) ok(`GET ${p}`);
    else fail(`GET ${p}`, `status=${res.status}`);
  }
}

async function testAuth() {
  console.log("\n[鉴权]");
  const { res } = await req("/api/m/auction/xxx/bid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  if (res.status === 401) ok("未登录出价返回 401");
  else fail("未登录出价", `expected 401, got ${res.status}`);

  const bad = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
  });
  if (bad.res.status === 401) ok("错误密码返回 401");
  else fail("错误密码", `expected 401, got ${bad.res.status}`);
}

async function testDevToken() {
  console.log("\n[开发 Token]");
  const { res, json } = await req("/api/dev/third-party-token?u_id=test-user");
  const isProd = process.env.NODE_ENV === "production" || process.env.SMOKE_PROD === "1";
  if (isProd) {
    if (res.status === 404) ok("生产环境 dev token 返回 404（预期）");
    else fail("生产环境 dev token", `expected 404, got ${res.status}`);
  } else if (res.status === 200 && json?.token) {
    ok("GET /api/dev/third-party-token");
  } else {
    fail("dev token", `status=${res.status}`);
  }
}

async function testAuction(userCookie, projectId, minBid, bidStep) {
  console.log("\n[竞拍]");
  if (!projectId) {
    fail("LIVE 竞拍项目", "数据库中无 LIVE 状态项目");
    return;
  }
  ok(`存在 LIVE 竞拍 ${projectId}`);

  const bidAmount = minBid ?? 8000;
  const { res, json } = await req(`/api/m/auction/${projectId}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookie },
    body: JSON.stringify({ amount: bidAmount }),
  });
  if (res.status === 200 && json?.ok) ok("出价成功");
  else fail("出价", `status=${res.status} body=${JSON.stringify(json)}`);

  const lowAmount = bidAmount + Math.max(1, Math.floor((bidStep ?? 200) / 2));
  const low = await req(`/api/m/auction/${projectId}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookie },
    body: JSON.stringify({ amount: lowAmount }),
  });
  if (low.res.status === 400) ok("低于加价幅度出价返回 400");
  else fail("低于加价幅度", `expected 400, got ${low.res.status}`);
}

async function testDrying(userCookie, listingId) {
  console.log("\n[晒场预约]");
  if (!listingId) {
    fail("晒场 listing", "无 OPERATING 晒场");
    return;
  }
  const { start, end } = futureDates(90 + Math.floor(Math.random() * 30));
  const headers = { "Content-Type": "application/json", Cookie: userCookie };

  const r1 = await req("/api/m/drying/reserve", {
    method: "POST",
    headers,
    body: JSON.stringify({ listingId, startDate: start, endDate: end }),
  });
  if (r1.res.status === 200 && r1.json?.ok) ok("晒场预约成功");
  else fail("晒场预约", `status=${r1.res.status} body=${JSON.stringify(r1.json)}`);

  const r2 = await req("/api/m/drying/reserve", {
    method: "POST",
    headers,
    body: JSON.stringify({ listingId, startDate: start, endDate: end }),
  });
  if (r2.res.status === 400 || r2.res.status === 409) ok("重复预约被拒绝");
  else fail("重复预约", `expected 400/409, got ${r2.res.status} body=${JSON.stringify(r2.json)}`);
}

async function testUpload(adminCookie) {
  console.log("\n[上传]");
  const noAuth = await req("/api/upload", { method: "POST", body: new FormData() });
  if (noAuth.res.status === 401) ok("未登录上传返回 401");
  else fail("未登录上传", `expected 401, got ${noAuth.res.status}`);

  const badType = await req("/api/upload", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: (() => {
      const fd = new FormData();
      fd.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt");
      return fd;
    })(),
  });
  if (badType.res.status === 400) ok("非图片上传返回 400");
  else fail("非图片上传", `expected 400, got ${badType.res.status}`);
}

async function getDbIds() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const live = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  const topBid = live?.bids[0]?.amount ? Number(live.bids[0].amount) : null;
  const startPrice = live ? Number(live.startPrice) : null;
  const bidStep = live ? Number(live.bidStep) : null;
  await prisma.$disconnect();
  return {
    projectId: live?.id,
    listingId: listing?.id,
    minBid: topBid != null && bidStep != null ? topBid + bidStep : startPrice,
    bidStep,
  };
}

function futureDates(offsetDays = 60) {
  const start = new Date();
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function main() {
  console.log(`冒烟测试 @ ${BASE}\n`);
  await testPages();
  await testAuth();
  await testDevToken();

  const userCookie = await loginUser();
  const adminCookie = await loginAdmin();

  const { projectId, listingId, minBid, bidStep } = await getDbIds();

  if (userCookie) {
    await testAuction(userCookie, projectId, minBid, bidStep);
    await testDrying(userCookie, listingId);
  }
  if (adminCookie) {
    await testUpload(adminCookie);
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (errors.length) {
    console.log("\n失败详情:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
