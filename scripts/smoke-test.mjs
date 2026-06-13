#!/usr/bin/env node
/**
 * Smoke test: pages, APIs, auth flows.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

const IDS = {
  auction: "cmnhdd6f9000njsb29fdxbprc",
  asset: "cmnhdd6ew000fjsb2cy86yhdr",
  drying: "cmnhdd6f5000jjsb2kdc8e7tl",
  announcement: "cmnhdd6fg000rjsb2wmh3ul2m",
  contract: "cmnhflkuk000gjsr9cwdekss6",
};

const pages = [
  "/",
  "/m",
  "/m/login",
  "/m/register",
  "/m/auction",
  `/m/auction/${IDS.auction}`,
  "/m/drying",
  `/m/drying/${IDS.drying}`,
  `/m/announcements/${IDS.announcement}`,
  `/m/contract/${IDS.contract}`,
  "/admin/login",
];

const errors = [];
let passed = 0;

function cookieHeader(setCookies) {
  if (!setCookies) return "";
  const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { redirect: "manual", ...opts });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text().catch(() => "");
  return { status: res.status, setCookie, text, headers: res.headers };
}

async function loginAdmin() {
  const r = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  if (r.status !== 200) throw new Error(`Admin login failed: ${r.status} ${r.text}`);
  return cookieHeader(r.setCookie);
}

async function loginUser() {
  const r = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  if (r.status !== 200) throw new Error(`User login failed: ${r.status} ${r.text}`);
  return cookieHeader(r.setCookie);
}

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    errors.push(`${name}: ${detail}`);
    console.log(`  ✗ ${name} — ${detail}`);
  }
}

async function testPages() {
  console.log("\n=== Public pages ===");
  for (const p of pages) {
    const r = await req(p);
    const ok = r.status === 200 || (p.startsWith("/admin") && r.status === 307);
    check(p, ok, `status ${r.status}`);
  }
}

async function testAdminPages(adminCookie) {
  console.log("\n=== Admin pages (authenticated) ===");
  const adminPages = [
    "/admin",
    "/admin/assets",
    `/admin/assets/${IDS.asset}`,
    "/admin/assets/new",
    "/admin/auctions",
    `/admin/auctions/${IDS.auction}`,
    "/admin/drying",
    "/admin/announcements",
    "/admin/registrations",
    "/admin/organizations",
    "/admin/admins",
    "/admin/dict",
    "/admin/config",
    "/admin/audit",
  ];
  for (const p of adminPages) {
    const r = await req(p, { headers: { Cookie: adminCookie } });
    check(p, r.status === 200, `status ${r.status}`);
  }
}

async function testUserPages(userCookie) {
  console.log("\n=== User pages (authenticated) ===");
  for (const p of ["/m/me", "/m/orders"]) {
    const r = await req(p, { headers: { Cookie: userCookie } });
    check(p, r.status === 200, `status ${r.status}`);
  }
}

async function testApis(adminCookie, userCookie) {
  console.log("\n=== APIs ===");

  // Admin login bad creds
  let r = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "x", password: "y" }),
  });
  check("POST /api/auth/admin/login (bad)", r.status === 401, `status ${r.status}`);

  // User login
  r = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  check("POST /api/auth/login", r.status === 200, `status ${r.status}`);

  // Protected API without auth
  r = await req("/api/m/auction/" + IDS.auction + "/bid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  check("POST /api/m/auction/bid (no auth)", r.status === 401, `status ${r.status}`);

  // Dev third-party token
  r = await req("/api/dev/third-party-token?u_id=test-user");
  check("GET /api/dev/third-party-token", r.status === 200, `status ${r.status}`);

  // Admin assets without multipart
  r = await req("/api/admin/assets", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "test" }),
  });
  check("POST /api/admin/assets (non-multipart)", r.status === 400, `status ${r.status}`);

  // Drying reserve without auth
  r = await req("/api/m/drying/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: IDS.drying, startDate: "2026-07-01", endDate: "2026-07-02" }),
  });
  check("POST /api/m/drying/reserve (no auth)", r.status === 401, `status ${r.status}`);

  // Logout
  r = await req("/api/auth/logout", { method: "POST", headers: { Cookie: userCookie } });
  check("POST /api/auth/logout", r.status === 200, `status ${r.status}`);
}

async function testDictLabels(userCookie) {
  console.log("\n=== Dict labels on pages ===");
  const r = await req("/m/auction", { headers: { Cookie: userCookie } });
  const hasChinese = r.text.includes("已结束") || r.text.includes("进行中");
  const hasRawEnum = r.text.includes(">ENDED<") || r.text.includes(">LIVE<");
  check("Auction page shows Chinese status", hasChinese && !hasRawEnum, hasRawEnum ? "raw enum visible" : "no Chinese label");
}

async function main() {
  console.log(`Smoke test against ${BASE}`);
  try {
    const adminCookie = await loginAdmin();
    const userCookie = await loginUser();
    await testPages();
    await testAdminPages(adminCookie);
    await testUserPages(userCookie);
    await testApis(adminCookie, userCookie);
    await testDictLabels(userCookie);
  } catch (e) {
    console.error("Fatal:", e.message);
    process.exit(1);
  }

  console.log(`\n=== Summary: ${passed} passed, ${errors.length} failed ===`);
  if (errors.length) {
    errors.forEach((e) => console.log("  -", e));
    process.exit(1);
  }
}

main();
