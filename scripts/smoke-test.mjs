#!/usr/bin/env node
/**
 * API smoke test for sishi-zichan platform.
 * Usage: BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

async function getMinBidAmount(projectId) {
  if (process.env.SMOKE_MIN_BID) return Number(process.env.SMOKE_MIN_BID);
  try {
    const { PrismaClient } = await import("@prisma/client");
    const { Decimal } = await import("@prisma/client/runtime/library");
    const prisma = new PrismaClient();
    const project = await prisma.auctionProject.findUnique({ where: { id: projectId } });
    if (!project) {
      await prisma.$disconnect();
      return null;
    }
    const top = await prisma.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    const minNext = top
      ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
      : new Decimal(project.startPrice.toString());
    const amount = Number(minNext.toFixed(2));
    await prisma.$disconnect();
    return amount;
  } catch {
    return 100000;
  }
}

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  errors.push({ name, detail });
  console.log(`  ✗ ${name}: ${detail}`);
}

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return { status: res.status, json, text, headers: res.headers };
}

function getCookie(headers, name) {
  const setCookie = headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // 1. Public pages
  for (const [name, path] of [
    ["首页", "/"],
    ["用户登录页", "/m/login"],
    ["竞拍列表", "/m/auction"],
    ["晒场列表", "/m/drying"],
    ["管理员登录页", "/admin/login"],
  ]) {
    const r = await fetch(`${BASE}${path}`);
    if (r.status === 200) ok(`页面 ${name}`);
    else fail(`页面 ${name}`, `HTTP ${r.status}`);
  }

  // 2. User login
  let userCookie = "";
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    const c = getCookie(r.headers, "sishi_user_session");
    if (r.status === 200 && r.json?.ok && c) {
      userCookie = c;
      ok("用户登录");
    } else fail("用户登录", `status=${r.status} body=${r.text}`);
  }

  // 3. Admin login
  let adminCookie = "";
  {
    const r = await req("/api/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    const c = getCookie(r.headers, "sishi_admin_session");
    if (r.status === 200 && r.json?.ok && c) {
      adminCookie = c;
      ok("管理员登录");
    } else fail("管理员登录", `status=${r.status} body=${r.text}`);
  }

  // 4. Unauthenticated bid → 401
  {
    const r = await req("/api/m/auction/fake/bid", {
      method: "POST",
      body: JSON.stringify({ amount: 1000 }),
    });
    if (r.status === 401) ok("未登录出价返回 401");
    else fail("未登录出价返回 401", `status=${r.status}`);
  }

  // 5. Admin assets without auth → 401
  {
    const r = await req("/api/admin/assets", { method: "POST", body: "{}" });
    if (r.status === 401) ok("未登录创建资产返回 401");
    else fail("未登录创建资产返回 401", `status=${r.status}`);
  }

  // 6. Upload without auth → 401
  {
    const r = await fetch(`${BASE}/api/upload`, { method: "POST" });
    if (r.status === 401) ok("未登录上传返回 401");
    else fail("未登录上传返回 401", `status=${r.status}`);
  }

  // 7. Upload wrong content-type → 400 (if implemented)
  if (adminCookie) {
    const r = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.status === 400) ok("上传非 multipart 返回 400");
    else if (r.status === 500) fail("上传非 multipart 返回 400", `got 500 (server error)`);
    else ok(`上传非 multipart 返回 ${r.status} (acceptable)`);
  }

  // 8. Dev third-party token (production → 404)
  {
    const r = await req("/api/dev/third-party-token");
    if (r.status === 404) ok("生产环境 dev token 返回 404");
    else if (r.status === 200 && r.json?.token) ok("dev token 可用");
    else fail("dev third-party-token", `status=${r.status}`);
  }

  // 9. Protected admin page without cookie → redirect
  {
    const r = await fetch(`${BASE}/admin`, { redirect: "manual" });
    if (r.status === 307 || r.status === 302) ok("未登录访问后台重定向");
    else fail("未登录访问后台重定向", `status=${r.status}`);
  }

  // 10. User logout
  if (userCookie) {
    const r = await req("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: userCookie },
    });
    if (r.status === 200) ok("用户登出");
    else fail("用户登出", `status=${r.status}`);
  }

  // Re-login for further tests
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    const c = getCookie(r.headers, "sishi_user_session");
    if (c) userCookie = c;
  }

  // 11. Get live auction from DB via auction page
  const auctionPage = await fetch(`${BASE}/m/auction`, { headers: { Cookie: userCookie } });
  const auctionHtml = await auctionPage.text();
  const hasAuction = auctionHtml.includes("竞拍") || auctionHtml.includes("暂无");
  if (auctionPage.status === 200 && hasAuction) ok("竞拍列表页可访问");
  else fail("竞拍列表页可访问", `status=${auctionPage.status}`);

  // 12. Bid on live auction (need project id from env or skip)
  const projectId = process.env.SMOKE_AUCTION_ID;
  if (projectId && userCookie) {
    const minBid = await getMinBidAmount(projectId);
    const r = await req(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({ amount: minBid }),
    });
    if (r.status === 200 && r.json?.ok) ok("竞拍出价");
    else fail("竞拍出价", `status=${r.status} body=${r.text}`);
  } else {
    console.log("  ~ 竞拍出价 (跳过: 无 SMOKE_AUCTION_ID 或竞拍未 LIVE)");
  }

  // 13. Drying reserve
  const listingId = process.env.SMOKE_LISTING_ID;
  if (listingId && userCookie) {
    const start = new Date();
    start.setDate(start.getDate() + 10);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const r = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    if (r.status === 200 && r.json?.ok) ok("晒场预约");
    else fail("晒场预约", `status=${r.status} body=${r.text}`);
  } else {
    console.log("  ~ 晒场预约 (跳过: 无 SMOKE_LISTING_ID)");
  }

  // 14. Mock payment duplicate deposit → 409
  if (projectId && userCookie) {
    const r = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId }),
    });
    if (r.status === 409) ok("重复缴纳保证金返回 409");
    else fail("重复缴纳保证金返回 409", `status=${r.status} body=${r.text}`);
  } else {
    console.log("  ~ 重复缴纳保证金 (跳过)");
  }

  // 15. Admin logout
  if (adminCookie) {
    const r = await req("/api/auth/admin/logout", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    if (r.status === 200) ok("管理员登出");
    else fail("管理员登出", `status=${r.status}`);
  }

  // 16. Invalid login
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    if (r.status === 401) ok("错误密码返回 401");
    else fail("错误密码返回 401", `status=${r.status}`);
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (errors.length) {
    console.log("\n失败详情:");
    for (const e of errors) console.log(`  - ${e.name}: ${e.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
