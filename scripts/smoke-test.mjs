#!/usr/bin/env node
/**
 * 功能冒烟测试：需已启动 dev server (npm run dev) 且已 seed。
 * 用法: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000";

const results = [];
let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed++;
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed++;
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchStatus(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...opts });
  return res;
}

function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const line of setCookieHeaders) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function loginUser() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookies = parseCookies(res.headers.getSetCookie?.() ?? []);
  const json = await res.json();
  return { res, cookies, json };
}

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookies = parseCookies(res.headers.getSetCookie?.() ?? []);
  const json = await res.json();
  return { res, cookies, json };
}

/** 提取页面中的实体链接，要求 cuid 至少 20 字符，避免匹配 RSC /page 路径 */
function extractEntityPath(html, prefix) {
  const re = new RegExp(`${prefix}/[a-z0-9]{20,}`);
  const m = html.match(re);
  return m ? m[0] : null;
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // 1. 公开页面
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    try {
      const res = await fetchStatus(path);
      if (res.status === 200) ok(`GET ${path}`, String(res.status));
      else fail(`GET ${path}`, `status ${res.status}`);
    } catch (e) {
      fail(`GET ${path}`, e.message);
    }
  }

  // 2. 用户登录
  let userCookies = {};
  try {
    const { res, cookies, json } = await loginUser();
    userCookies = cookies;
    if (res.status === 200 && json.ok) ok("POST /api/auth/login");
    else fail("POST /api/auth/login", JSON.stringify(json));
  } catch (e) {
    fail("POST /api/auth/login", e.message);
  }

  // 3. 管理员登录
  let adminCookies = {};
  try {
    const { res, cookies, json } = await loginAdmin();
    adminCookies = cookies;
    if (res.status === 200 && (json.ok || cookies.sishi_admin_session)) ok("POST /api/auth/admin/login");
    else fail("POST /api/auth/admin/login", JSON.stringify(json));
  } catch (e) {
    fail("POST /api/auth/admin/login", e.message);
  }

  // 4. 竞拍页显示中文状态
  try {
    const res = await fetch(`${BASE}/m/auction`);
    const html = await res.text();
    if (html.includes("进行中")) ok("auction page shows 进行中");
    else if (html.includes("LIVE")) fail("auction page shows LIVE (dict missing?)");
    else fail("auction page missing 进行中 label");
  } catch (e) {
    fail("auction page label", e.message);
  }

  // 5. 提取竞拍项目并出价
  try {
    const res = await fetch(`${BASE}/m/auction`, {
      headers: { Cookie: cookieHeader(userCookies) },
    });
    const html = await res.text();
    const link = extractEntityPath(html, "/m/auction");
    if (!link) {
      fail("extract auction project link");
    } else {
      const projectId = link.replace("/m/auction/", "");
      ok("extract auction project", projectId);

      const bidRes = await fetch(`${BASE}/api/m/auction/${projectId}/bid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader(userCookies),
        },
        body: JSON.stringify({ amount: 8200 }),
      });
      const bidJson = await bidRes.json();
      if (bidRes.status === 200 && bidJson.ok) ok("POST bid", `bidId=${bidJson.bidId}`);
      else fail("POST bid", JSON.stringify(bidJson));
    }
  } catch (e) {
    fail("bid flow", e.message);
  }

  // 6. 晒场预约
  try {
    const res = await fetch(`${BASE}/m/drying`, {
      headers: { Cookie: cookieHeader(userCookies) },
    });
    const html = await res.text();
    const link = extractEntityPath(html, "/m/drying");
    if (!link) {
      fail("extract drying listing link");
    } else {
      const listingId = link.replace("/m/drying/", "");
      ok("extract drying listing", listingId);

      const reserveRes = await fetch(`${BASE}/api/m/drying/reserve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader(userCookies),
        },
        body: JSON.stringify({
          listingId,
          startDate: "2026-08-01",
          endDate: "2026-08-02",
        }),
      });
      const reserveJson = await reserveRes.json();
      if (reserveRes.status === 200 && reserveJson.ok) ok("POST drying reserve", reserveJson.orderNo);
      else fail("POST drying reserve", JSON.stringify(reserveJson));
    }
  } catch (e) {
    fail("drying reserve flow", e.message);
  }

  // 7. 第三方 token（开发环境）
  try {
    const res = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke_test`);
    const json = await res.json();
    if (res.status === 200 && json.token) ok("GET third-party-token");
    else fail("GET third-party-token", JSON.stringify(json));
  } catch (e) {
    fail("GET third-party-token", e.message);
  }

  // 8. 管理后台页面
  for (const path of ["/admin", "/admin/auctions", "/admin/dict", "/admin/assets"]) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Cookie: cookieHeader(adminCookies) },
        redirect: "manual",
      });
      if (res.status === 200) ok(`GET ${path} (admin)`);
      else fail(`GET ${path} (admin)`, `status ${res.status}`);
    } catch (e) {
      fail(`GET ${path} (admin)`, e.message);
    }
  }

  // 9. 管理后台字典页含中文标签
  try {
    const res = await fetch(`${BASE}/admin/auctions`, {
      headers: { Cookie: cookieHeader(adminCookies) },
    });
    const html = await res.text();
    if (html.includes("进行中")) ok("admin auctions shows 进行中");
    else fail("admin auctions missing 进行中");
  } catch (e) {
    fail("admin auctions label", e.message);
  }

  // 10. 未登录访问受保护 API
  try {
    const res = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: "x", startDate: "2026-01-01", endDate: "2026-01-02" }),
    });
    if (res.status === 401) ok("reserve requires auth (401)");
    else fail("reserve requires auth", `status ${res.status}`);
  } catch (e) {
    fail("reserve auth check", e.message);
  }

  console.log(`\n${passed}/${passed + failed} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
