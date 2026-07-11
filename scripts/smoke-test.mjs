#!/usr/bin/env node
/**
 * 功能冒烟测试 — 覆盖主要页面、鉴权与核心 API
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
  console.log(`  ✗ ${msg}`);
}

/** 简易 cookie jar */
function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const h of setCookieHeaders) {
    const part = h.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function fetchJson(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...(opts.headers || {}) };
  if (opts.cookies) headers.cookie = cookieHeader(opts.cookies);
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: { "content-type": "application/json", ...headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
  }
  const setCookies = res.headers.getSetCookie?.() || [];
  const newCookies = parseCookies(setCookies);
  const cookies = { ...(opts.cookies || {}), ...newCookies };
  return { res, json, text, cookies };
}

async function fetchPage(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const text = await res.text();
  return { res, text };
}

/** 从 HTML 提取 /m/auction/{id} 链接，id 至少 20 字符避免匹配 RSC 路径 */
function extractAuctionId(html) {
  const m = html.match(/\/m\/auction\/([a-z0-9]{20,})/i);
  return m?.[1] ?? null;
}

function extractDryingId(html) {
  const m = html.match(/\/m\/drying\/([a-z0-9]{20,})/i);
  return m?.[1] ?? null;
}

async function testPages() {
  console.log("\n[页面加载]");
  const pages = [
    ["/m", "首页"],
    ["/m/auction", "竞拍列表"],
    ["/m/drying", "晒场列表"],
    ["/m/login", "用户登录"],
    ["/admin/login", "管理登录"],
  ];
  for (const [path, name] of pages) {
    const { res, text } = await fetchPage(path);
    if (res.status === 200 && text.length > 100) ok(`${name} ${path}`);
    else fail(`${name} ${path}`, `status=${res.status} len=${text.length}`);
  }
}

async function testDictLabels() {
  console.log("\n[字典中文标签]");
  const { text } = await fetchPage("/m/auction");
  if (text.includes("进行中")) ok("竞拍状态显示「进行中」");
  else if (text.includes("LIVE")) fail("竞拍状态", "仍显示英文 LIVE");
  else fail("竞拍状态", "未找到状态标签");
}

async function testAuth() {
  console.log("\n[鉴权]");
  const unauth = await fetchJson("/api/m/auction/fake/bid", { method: "POST", body: { amount: 1 } });
  if (unauth.res.status === 401) ok("未登录出价返回 401");
  else fail("未登录出价", `status=${unauth.res.status}`);

  const badLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    body: { phone: "000", password: "x" },
  });
  if (badLogin.res.status === 400 || badLogin.res.status === 401) ok("错误密码登录被拒绝");
  else fail("错误密码登录", `status=${badLogin.res.status}`);
}

async function testUserLogin() {
  console.log("\n[用户登录]");
  const { res, json, cookies } = await fetchJson("/api/auth/login", {
    method: "POST",
    body: USER,
  });
  if (res.status === 200 && json?.ok && cookies.sishi_user_session) {
    ok("用户登录成功");
    return cookies;
  }
  fail("用户登录", `status=${res.status} json=${JSON.stringify(json)}`);
  return null;
}

async function testAdminLogin() {
  console.log("\n[管理员登录]");
  const { res, json, cookies } = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    body: ADMIN,
  });
  if (res.status === 200 && json?.ok && cookies.sishi_admin_session) {
    ok("管理员登录成功");
    return cookies;
  }
  fail("管理员登录", `status=${res.status} json=${JSON.stringify(json)}`);
  return null;
}

async function testAuctionBid(userCookies) {
  console.log("\n[竞拍出价]");
  const { text } = await fetchPage("/m/auction");
  const projectId = extractAuctionId(text);
  if (!projectId) {
    fail("提取竞拍项目ID", "页面无竞拍链接");
    return;
  }
  ok(`提取竞拍项目 ${projectId.slice(0, 8)}…`);

  const bid = await fetchJson(`/api/m/auction/${projectId}/bid`, {
    method: "POST",
    cookies: userCookies,
    body: { amount: 8200 },
  });
  if (bid.res.status === 200 && bid.json?.ok) ok("出价成功");
  else fail("出价", `status=${bid.res.status} ${bid.json?.error || bid.text}`);
}

async function testDryingReserve(userCookies) {
  console.log("\n[晒场预约]");
  const { text } = await fetchPage("/m/drying");
  const listingId = extractDryingId(text);
  if (!listingId) {
    fail("提取晒场ID", "页面无晒场链接");
    return;
  }
  ok(`提取晒场 ${listingId.slice(0, 8)}…`);

  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const reserve = await fetchJson("/api/m/drying/reserve", {
    method: "POST",
    cookies: userCookies,
    body: { listingId, startDate: fmt(start), endDate: fmt(end) },
  });
  if (reserve.res.status === 200 && reserve.json?.ok) {
    ok(`预约成功 orderNo=${reserve.json.orderNo}`);
    return reserve.json.id;
  }
  fail("晒场预约", `status=${reserve.res.status} ${reserve.json?.error || reserve.text}`);
  return null;
}

async function testMockPaymentDuplicate(userCookies) {
  console.log("\n[支付幂等]");
  const { text } = await fetchPage("/m/auction");
  const projectId = extractAuctionId(text);
  if (!projectId) return;

  const pay = await fetchJson("/api/m/payments/mock", {
    method: "POST",
    cookies: userCookies,
    body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId },
  });
  if (pay.res.status === 409) ok("重复缴保证金返回 409");
  else if (pay.res.status === 200) ok("保证金缴纳（首次）");
  else fail("保证金支付", `status=${pay.res.status} ${pay.json?.error || pay.text}`);
}

async function testAdminPages(adminCookies) {
  console.log("\n[管理后台页面]");
  const pages = ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying"];
  for (const path of pages) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { cookie: cookieHeader(adminCookies) },
      redirect: "manual",
    });
    if (res.status === 200) ok(`管理页 ${path}`);
    else fail(`管理页 ${path}`, `status=${res.status}`);
  }
}

async function testDevToken() {
  console.log("\n[开发工具]");
  const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=test-smoke");
  if (res.status === 200 && json?.token) ok("第三方 token 生成");
  else fail("第三方 token", `status=${res.status}`);
}

async function testUserPages(userCookies) {
  console.log("\n[用户页面]");
  const pages = ["/m/me", "/m/orders"];
  for (const path of pages) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { cookie: cookieHeader(userCookies) },
      redirect: "manual",
    });
    if (res.status === 200) ok(`用户页 ${path}`);
    else fail(`用户页 ${path}`, `status=${res.status}`);
  }
}

async function main() {
  console.log(`Smoke test → ${BASE}`);
  try {
    const health = await fetch(BASE);
    if (!health.ok && health.status !== 307) {
      fail("服务可达", `status=${health.status}`);
      process.exit(1);
    }
    ok("服务可达");
  } catch (e) {
    fail("服务可达", e.message);
    console.error("\n请先启动: npm run dev");
    process.exit(1);
  }

  await testPages();
  await testDictLabels();
  await testAuth();
  const userCookies = await testUserLogin();
  const adminCookies = await testAdminLogin();
  if (userCookies) {
    await testUserPages(userCookies);
    await testAuctionBid(userCookies);
    await testDryingReserve(userCookies);
    await testMockPaymentDuplicate(userCookies);
  }
  if (adminCookies) await testAdminPages(adminCookies);
  await testDevToken();

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (errors.length) {
    console.log("\n失败详情:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
  console.log("全部通过 ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
