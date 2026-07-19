#!/usr/bin/env node
/**
 * Functional smoke tests against local dev server.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

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
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    redirect: "manual",
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { res, text, json };
}

function getCookie(res, name) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const list = raw.length ? raw : [res.headers.get("set-cookie")].filter(Boolean);
  for (const c of list) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function main() {
  console.log(`Smoke tests @ ${BASE}\n`);

  // --- Public pages ---
  for (const [path, label] of [
    ["/", "首页"],
    ["/m", "H5 首页"],
    ["/m/login", "H5 登录页"],
    ["/m/auction", "竞拍列表"],
    ["/m/drying", "晒场列表"],
    ["/admin/login", "管理登录页"],
  ]) {
    const { res } = await req(path);
    if (res.status === 200) ok(`GET ${label}`);
    else fail(`GET ${label}`, `status ${res.status}`);
  }

  // --- Auth validation ---
  {
    const { res, json } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "", password: "" }),
    });
    if (res.status === 400) ok("用户登录空参数 400");
    else fail("用户登录空参数 400", `status ${res.status} ${JSON.stringify(json)}`);
  }

  {
    const { res } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "00000000000", password: "wrong" }),
    });
    if (res.status === 401) ok("用户登录错误密码 401");
    else fail("用户登录错误密码 401", `status ${res.status}`);
  }

  // --- Admin login ---
  let adminCookie = null;
  {
    const { res, json } = await req("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminCookie = getCookie(res, "sishi_admin_session");
    if (res.status === 200 && json?.ok && adminCookie) ok("管理员登录");
    else fail("管理员登录", `status ${res.status} cookie=${!!adminCookie}`);
  }

  // --- User login ---
  let userCookie = null;
  {
    const { res, json } = await req("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    // wrong endpoint - should fail
    if (res.status === 401) ok("管理员端拒绝普通用户");
    else fail("管理员端拒绝普通用户", `status ${res.status}`);
  }

  {
    const { res, json } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userCookie = getCookie(res, "sishi_user_session");
    if (res.status === 200 && json?.ok && userCookie) ok("用户登录");
    else fail("用户登录", `status ${res.status} cookie=${!!userCookie}`);
  }

  // --- Upload without auth ---
  {
    const { res } = await req("/api/upload", { method: "POST" });
    if (res.status === 401) ok("上传未登录 401");
    else fail("上传未登录 401", `status ${res.status}`);
  }

  // --- Upload non-multipart ---
  if (adminCookie) {
    const { res } = await req("/api/upload", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ file: "x" }),
    });
    if (res.status === 400) ok("上传非 multipart 400");
    else fail("上传非 multipart 400", `status ${res.status}`);
  }

  // --- Dev third-party token ---
  {
    const { res, json } = await req("/api/dev/third-party-token?u_id=smoke_test");
    if (res.status === 200 && json?.token) ok("第三方 token 开发接口");
    else fail("第三方 token 开发接口", `status ${res.status}`);
  }

  // --- Protected admin pages ---
  if (adminCookie) {
    for (const [path, label] of [
      ["/admin", "管理首页"],
      ["/admin/assets", "资产管理"],
      ["/admin/auctions", "竞拍管理"],
      ["/admin/dict", "字典管理"],
    ]) {
      const { res } = await req(path, { headers: { Cookie: adminCookie } });
      if (res.status === 200) ok(`GET ${label} (已登录)`);
      else fail(`GET ${label} (已登录)`, `status ${res.status}`);
    }
  }

  // --- Auction bid & payment flows ---
  let projectId = null;
  if (userCookie) {
    const { res, text } = await req("/m/auction", { headers: { Cookie: userCookie } });
    if (res.status === 200) ok("用户竞拍列表页");
    else fail("用户竞拍列表页", `status ${res.status}`);

    // find LIVE project from HTML or query DB via page
    const m = text.match(/\/m\/auction\/(c[a-z0-9]{20,})/i);
    if (m) {
      projectId = m[1];
      ok(`发现竞拍项目 ${projectId}`);
    } else {
      fail("发现竞拍项目", "页面上无 LIVE 项目链接");
    }
  }

  if (userCookie && projectId) {
    const { res } = await req(`/m/auction/${projectId}`, { headers: { Cookie: userCookie } });
    if (res.status === 200) ok("竞拍详情页");
    else fail("竞拍详情页", `status ${res.status}`);

    const { res: bidRes, json: bidJson } = await req(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { Cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 50000 }),
    });
    if (bidRes.status === 200 && bidJson?.ok) ok("出价成功");
    else fail("出价成功", `status ${bidRes.status} ${JSON.stringify(bidJson)}`);

    const { res: dupRes } = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId }),
    });
    if (dupRes.status === 409) ok("重复缴纳保证金 409");
    else fail("重复缴纳保证金 409", `status ${dupRes.status}`);
  }

  // --- Drying reserve ---
  let listingId = null;
  if (userCookie) {
    const { res, text } = await req("/m/drying", { headers: { Cookie: userCookie } });
    if (res.status === 200) ok("晒场列表页");
    else fail("晒场列表页", `status ${res.status}`);
    const m = text.match(/\/m\/drying\/(c[a-z0-9]{20,})/i);
    if (m) listingId = m[1];
  }

  if (userCookie && listingId) {
    const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const { res, json } = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        startDate: fmt(start),
        endDate: fmt(end),
      }),
    });
    if (res.status === 200 && json?.ok) ok("晒场预约");
    else fail("晒场预约", `status ${res.status} ${JSON.stringify(json)}`);
  }

  // --- Admin API ---
  if (adminCookie) {
    const { res } = await req("/api/admin/assets", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 400) ok("管理端资产创建缺参 400");
    else fail("管理端资产创建缺参 400", `status ${res.status}`);
  }

  // --- Logout ---
  if (userCookie) {
    const { res } = await req("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: userCookie },
    });
    if (res.status === 200) ok("用户登出");
    else fail("用户登出", `status ${res.status}`);
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
