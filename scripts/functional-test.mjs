#!/usr/bin/env node
/**
 * 端到端 HTTP 功能测试（需 dev server + MariaDB 已启动）。
 * 用法：npm run test:functional
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
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

async function main() {
  console.log(`\n=== 功能测试 ${BASE} ===\n`);

  // 1. 静态页面
  console.log("1. 页面可访问");
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    assert(res.status === 200 || res.status === 307, `${path} -> ${res.status}`);
  }

  // 2. 管理端登录
  console.log("\n2. 管理端登录");
  const adminJar = new Map();
  const adminLogin = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  for (const c of adminLogin.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    adminJar.set(k.trim(), v);
  }
  const adminBody = await adminLogin.json();
  assert(adminBody.ok === true, "师级管理员登录成功");

  const adminCookie = [...adminJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying"]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: adminCookie } });
    assert(res.status === 200, `管理端 ${path} -> ${res.status}`);
  }

  // 3. 移动端登录
  console.log("\n3. 移动端登录");
  const userJar = new Map();
  const userLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  for (const c of userLogin.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    userJar.set(k.trim(), v);
  }
  const userBody = await userLogin.json();
  assert(userBody.ok === true, "承租用户登录成功");
  const userCookie = [...userJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  // 4. 获取 LIVE 竞拍
  console.log("\n4. 竞拍出价");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const project = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  assert(!!project, "存在 LIVE 竞拍项目");
  if (project) {
    const bidOk = await jsonFetch(`/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: Number(project.startPrice) + Number(project.bidStep) }),
    });
    assert(bidOk.body?.ok === true, "有效出价成功");

    const bidBad = await jsonFetch(`/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: Number(project.startPrice) + 50 }),
    });
    assert(bidBad.status === 400, "无效加价被拒绝");

    const rentLive = await jsonFetch("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_RENT", auctionProjectId: project.id }),
    });
    assert(rentLive.status === 400, "LIVE 竞拍拒绝租金支付");
  }

  // 5. 晒场预约
  console.log("\n5. 晒场预约");
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    include: { bookingRules: true },
  });
  assert(!!listing, "存在运营中晒场");
  if (listing) {
    const maxAdvance = listing.bookingRules[0]?.maxAdvanceDays ?? 7;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startDate = tomorrow.toISOString().slice(0, 10);
    const reserveOk = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ listingId: listing.id, startDate, endDate: startDate }),
    });
    assert(reserveOk.body?.ok === true, "有效预约成功");

    const tooFar = new Date();
    tooFar.setDate(tooFar.getDate() + maxAdvance + 3);
    const farDate = tooFar.toISOString().slice(0, 10);
    const reserveBad = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ listingId: listing.id, startDate: farDate, endDate: farDate }),
    });
    assert(reserveBad.status === 400, "超出 maxAdvanceDays 被拒绝");
  }

  // 6. 第三方 JWT
  console.log("\n6. 第三方登录");
  const tokenRes = await jsonFetch("/api/dev/third-party-token?u_id=test-user-001");
  assert(typeof tokenRes.body?.token === "string", "获取 JWT token");
  const ssoRes = await fetch(`${BASE}/m/sso?token=${tokenRes.body.token}`);
  assert(ssoRes.status === 200, "SSO 页面可访问");

  await prisma.$disconnect();

  console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
