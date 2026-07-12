#!/usr/bin/env node
/**
 * Functional smoke test for sishi-zichan.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3000";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  console.error(`✗ ${name}: ${detail}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

function extractCookie(setCookie) {
  if (!setCookie) return "";
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // --- Public pages ---
  for (const [name, path] of [
    ["门户首页", "/"],
    ["移动端首页", "/m"],
    ["移动端登录", "/m/login"],
    ["管理后台登录", "/admin/login"],
    ["移动端竞拍列表", "/m/auction"],
    ["移动端晒场列表", "/m/drying"],
  ]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 200) ok(`页面 ${name}`);
    else fail(`页面 ${name}`, `HTTP ${res.status}`);
  }

  // --- Admin login + protected pages ---
  const adminLogin = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookie = extractCookie(adminLogin.res.headers.getSetCookie?.() ?? adminLogin.res.headers.get("set-cookie"));
  if (adminLogin.res.status === 200 && adminLogin.json?.ok) ok("管理员登录");
  else fail("管理员登录", JSON.stringify(adminLogin.json));

  const adminPages = [
    "/admin",
    "/admin/assets",
    "/admin/auctions",
    "/admin/drying",
    "/admin/dict",
    "/admin/organizations",
    "/admin/announcements",
    "/admin/registrations",
    "/admin/audit",
    "/admin/config",
    "/admin/admins",
  ];
  for (const path of adminPages) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: adminCookie } });
    if (res.status === 200) ok(`管理页 ${path}`);
    else fail(`管理页 ${path}`, `HTTP ${res.status}`);
  }

  // --- Upload non-multipart should return 400 ---
  const badUpload = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: "{}",
  });
  if (badUpload.status === 400) ok("上传非 multipart 拦截 (400)");
  else fail("上传非 multipart 拦截", `HTTP ${badUpload.status}`);

  // --- User login ---
  const userLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const userCookie = extractCookie(userLogin.res.headers.getSetCookie?.() ?? userLogin.res.headers.get("set-cookie"));
  if (userLogin.res.status === 200 && userLogin.json?.ok) ok("用户登录");
  else fail("用户登录", JSON.stringify(userLogin.json));

  // --- Auction bid ---
  const project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!project) {
    fail("竞拍出价", "无 LIVE 竞拍项目");
  } else {
    const now = Date.now();
    if (project.endsAt.getTime() < now) {
      fail("竞拍状态", `项目已结束 endsAt=${project.endsAt.toISOString()}`);
    } else {
      ok(`竞拍项目 LIVE (${project.id.slice(0, 8)}…)`);
    }
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const minAmount = topBid
      ? Number(topBid.amount) + Number(project.bidStep)
      : Number(project.startPrice);
    const bid = await fetchJson(`/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({ amount: minAmount }),
    });
    if (bid.res.status === 200 && bid.json?.ok) ok("竞拍出价");
    else fail("竞拍出价", JSON.stringify(bid.json));
  }

  // --- Drying reserve ---
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (!listing) {
    fail("晒场预约", "无运营中晒场");
  } else {
    const start = new Date();
    start.setDate(start.getDate() + 2);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const reserve = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    if (reserve.res.status === 200 && reserve.json?.ok) ok("晒场预约");
    else fail("晒场预约", JSON.stringify(reserve.json));
  }

  // --- Mock payment duplicate (409 expected if deposit already paid) ---
  if (project) {
    const pay = await fetchJson("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
    });
    if (pay.res.status === 409) ok("保证金重复支付拦截 (409)");
    else if (pay.res.status === 200) ok("保证金支付");
    else fail("保证金支付", `HTTP ${pay.res.status} ${JSON.stringify(pay.json)}`);
  }

  // --- Third-party SSO ---
  const tokenRes = await fetchJson("/api/dev/third-party-token?u_id=smoke_test_user");
  if (tokenRes.res.status === 200 && tokenRes.json?.token) {
    ok("第三方 token 生成");
    const sso = await fetchJson("/api/auth/third-party", {
      method: "POST",
      body: JSON.stringify({ token: tokenRes.json.token }),
    });
    if (sso.res.status === 200 && sso.json?.ok) ok("第三方 SSO 登录");
    else fail("第三方 SSO 登录", JSON.stringify(sso.json));
  } else {
    fail("第三方 token 生成", JSON.stringify(tokenRes.json));
  }

  // --- Dict check ---
  const dictCount = await prisma.dictCategory.count();
  if (dictCount > 0) ok(`字典数据 (${dictCount} 类)`);
  else fail("字典数据", "dictCategory 为空，页面可能显示英文枚举");

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
