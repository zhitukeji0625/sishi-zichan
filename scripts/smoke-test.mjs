#!/usr/bin/env node
/**
 * HTTP smoke tests for sishi-zichan (run against `npm run dev`).
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

const results = [];
let passed = 0;
let failed = 0;

function cookieFrom(res) {
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) return sc.map((c) => c.split(";")[0]).join("; ");
  const raw = res.headers.get("set-cookie");
  return raw ? raw.split(",").map((c) => c.split(";")[0].trim()).join("; ") : "";
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok || r.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server not ready at ${BASE}`);
}

async function main() {
  console.log(`Smoke tests → ${BASE}`);
  await waitForServer();

  let adminCookie = "";
  let userCookie = "";
  let projectId = "";
  let listingId = "";

  // --- Public pages ---
  await test("首页 200", async () => {
    const r = await fetch(`${BASE}/`);
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("管理登录页 200", async () => {
    const r = await fetch(`${BASE}/admin/login`);
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("移动端首页 200", async () => {
    const r = await fetch(`${BASE}/m`);
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("竞拍列表 200", async () => {
    const r = await fetch(`${BASE}/m/auction`);
    assert(r.status === 200, `status ${r.status}`);
    const html = await r.text();
    const m = html.match(/\/m\/auction\/(cm[a-z0-9]{20,})/i);
    if (m) projectId = m[1];
  });

  await test("晒场列表 200", async () => {
    const r = await fetch(`${BASE}/m/drying`);
    assert(r.status === 200, `status ${r.status}`);
    const html = await r.text();
    const m = html.match(/\/m\/drying\/(cm[a-z0-9]{20,})/i);
    if (m) listingId = m[1];
  });

  await test("个人中心可访问", async () => {
    const r = await fetch(`${BASE}/m/me`, { redirect: "manual" });
    assert([200, 302, 307].includes(r.status), `status ${r.status}`);
  });

  await test("用户登录页 200", async () => {
    const r = await fetch(`${BASE}/m/login`);
    assert(r.status === 200, `status ${r.status}`);
  });

  // --- Auth APIs ---
  await test("管理员登录成功", async () => {
    const r = await fetch(`${BASE}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    const b = await r.json();
    assert(r.ok, JSON.stringify(b));
    adminCookie = cookieFrom(r);
    assert(adminCookie, "missing admin cookie");
  });

  await test("管理员错误密码 401", async () => {
    const r = await fetch(`${BASE}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "wrong" }),
    });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test("用户登录成功", async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    const b = await r.json();
    assert(r.ok, JSON.stringify(b));
    userCookie = cookieFrom(r);
    assert(userCookie, "missing user cookie");
  });

  await test("用户错误密码 401", async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test("第三方 token 开发接口", async () => {
    const r = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke_test`);
    const b = await r.json();
    assert(r.ok && b.token, JSON.stringify(b));
  });

  // --- Multipart guards ---
  await test("上传非 multipart 返回 400", async () => {
    const r = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: "{}",
    });
    assert(r.status === 400, `status ${r.status}`);
  });

  await test("资产创建非 multipart 返回 400", async () => {
    const r = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: "{}",
    });
    assert(r.status === 400, `status ${r.status}`);
  });

  await test("未登录上传 401", async () => {
    const r = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert(r.status === 401, `status ${r.status}`);
  });

  // --- Auction ---
  await test("出价未登录 401", async () => {
    const id = projectId || "unknown";
    const r = await fetch(`${BASE}/api/m/auction/${id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 8200 }),
    });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test("出价成功", async () => {
    assert(projectId, "no project id from auction page");
    const r = await fetch(`${BASE}/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: 99999 }),
    });
    const b = await r.json();
    assert(r.ok, JSON.stringify(b));
  });

  await test("出价金额无效 400", async () => {
    const r = await fetch(`${BASE}/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: -1 }),
    });
    assert(r.status === 400, `status ${r.status}`);
  });

  // --- Drying ---
  await test("晒场预约未登录 401", async () => {
    const r = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: "x", startDate: "2026-10-01", endDate: "2026-10-02" }),
    });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test("晒场预约参数无效 400", async () => {
    const r = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({}),
    });
    assert(r.status === 400, `status ${r.status}`);
  });

  await test("晒场预约提交", async () => {
    assert(listingId, "no listing id from drying page");
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const r = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    const b = await r.json();
    assert(r.ok, JSON.stringify(b));
  });

  // --- Payments ---
  await test("模拟支付未登录 401", async () => {
    const r = await fetch(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId }),
    });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test("模拟支付参数无效 400", async () => {
    const r = await fetch(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({}),
    });
    assert(r.status === 400, `status ${r.status}`);
  });

  // --- Admin pages (authenticated) ---
  await test("管理后台首页 200", async () => {
    const r = await fetch(`${BASE}/admin`, { headers: { Cookie: adminCookie } });
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("管理资产页 200", async () => {
    const r = await fetch(`${BASE}/admin/assets`, { headers: { Cookie: adminCookie } });
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("管理竞拍页 200", async () => {
    const r = await fetch(`${BASE}/admin/auctions`, { headers: { Cookie: adminCookie } });
    assert(r.status === 200, `status ${r.status}`);
  });

  // --- Logout ---
  await test("用户登出", async () => {
    const r = await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: userCookie },
    });
    assert(r.ok, `status ${r.status}`);
  });

  await test("管理员登出", async () => {
    const r = await fetch(`${BASE}/api/auth/admin/logout`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    assert(r.ok, `status ${r.status}`);
  });

  console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
