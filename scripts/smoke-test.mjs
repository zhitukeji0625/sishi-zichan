#!/usr/bin/env node
/**
 * Functional smoke test — requires dev server on BASE_URL (default http://localhost:3000).
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  console.error(`  ✗ ${name}: ${detail}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
  }
  return { res, json, text };
}

function extractCookie(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const h of headers) {
    const m = h.match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

async function loginAdmin() {
  const { res, json } = await fetchJson(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookie = extractCookie(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"), "sishi_admin_session");
  return { res, json, cookie };
}

async function loginUser() {
  const { res, json } = await fetchJson(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookie = extractCookie(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"), "sishi_user_session");
  return { res, json, cookie };
}

async function getAuctionId() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const a = await p.auctionProject.findFirst({ orderBy: { createdAt: "asc" } });
    return a?.id ?? null;
  } finally {
    await p.$disconnect();
  }
}

async function getListingId() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const l = await p.dryingFieldListing.findFirst();
    return l?.id ?? null;
  } finally {
    await p.$disconnect();
  }
}

async function run() {
  console.log(`Smoke test @ ${BASE}\n`);

  // Static pages
  for (const [name, path] of [
    ["首页", "/"],
    ["管理登录页", "/admin/login"],
    ["H5 首页", "/m"],
    ["竞拍列表", "/m/auction"],
    ["晒场列表", "/m/drying"],
  ]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.ok) ok(name);
    else fail(name, `HTTP ${res.status}`);
  }

  // Admin auth
  const admin = await loginAdmin();
  if (admin.res.ok && admin.json?.ok) ok("管理登录 API");
  else fail("管理登录 API", JSON.stringify(admin.json));

  if (admin.cookie) {
    const dash = await fetch(`${BASE}/admin`, { headers: { Cookie: `sishi_admin_session=${admin.cookie}` } });
    if (dash.ok) ok("管理后台首页");
    else fail("管理后台首页", `HTTP ${dash.status}`);

    for (const [name, path] of [
      ["资产列表", "/admin/assets"],
      ["竞拍管理", "/admin/auctions"],
      ["数据字典", "/admin/dict"],
      ["晒场管理", "/admin/drying"],
      ["报名审核", "/admin/registrations"],
    ]) {
      const res = await fetch(`${BASE}${path}`, { headers: { Cookie: `sishi_admin_session=${admin.cookie}` } });
      if (res.ok) ok(name);
      else fail(name, `HTTP ${res.status}`);
    }
  } else {
    fail("管理 Cookie", "missing");
  }

  // User auth
  const user = await loginUser();
  if (user.res.ok && user.json?.ok) ok("用户登录 API");
  else fail("用户登录 API", JSON.stringify(user.json));

  if (user.cookie) {
    const me = await fetch(`${BASE}/m/me`, { headers: { Cookie: `sishi_user_session=${user.cookie}` } });
    if (me.ok) ok("用户中心");
    else fail("用户中心", `HTTP ${me.status}`);
  } else {
    fail("用户 Cookie", "missing");
  }

  // Third-party token
  const tp = await fetchJson(`${BASE}/api/dev/third-party-token?u_id=smoke001`);
  if (tp.res.ok && tp.json?.token) ok("第三方 token");
  else fail("第三方 token", tp.text?.slice(0, 100));

  // Auction bid
  const auctionId = await getAuctionId();
  if (!auctionId) {
    fail("竞拍出价", "no auction project");
  } else if (user.cookie) {
    const bid = await fetchJson(`${BASE}/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `sishi_user_session=${user.cookie}` },
      body: JSON.stringify({ amount: 8200 }),
    });
    if (bid.res.ok && bid.json?.ok) ok("竞拍出价");
    else fail("竞拍出价", bid.json?.error ?? bid.text);
  }

  // Drying reserve
  const listingId = await getListingId();
  if (!listingId) {
    fail("晒场预约", "no listing");
  } else if (user.cookie) {
    const reserve = await fetchJson(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `sishi_user_session=${user.cookie}` },
      body: JSON.stringify({ listingId, startDate: "2026-08-01", endDate: "2026-08-02" }),
    });
    if (reserve.res.ok && reserve.json?.ok) ok("晒场预约");
    else fail("晒场预约", reserve.json?.error ?? reserve.text);
  }

  // Dict labels on auction page
  const auctionPage = await fetch(`${BASE}/m/auction`);
  const html = await auctionPage.text();
  if (html.includes("进行中") || html.includes("待开始")) ok("竞拍状态中文标签");
  else if (html.includes("LIVE")) fail("竞拍状态中文标签", "shows raw LIVE enum");
  else ok("竞拍状态中文标签");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
