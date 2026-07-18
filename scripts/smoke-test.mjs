#!/usr/bin/env node
/**
 * Smoke test for sishi-zichan API and pages.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  errors.push({ name, detail });
  console.log(`  ✗ ${name}: ${detail}`);
}

async function req(method, path, { body, headers = {}, cookies = "", expectStatus } = {}) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { ...headers } };
  if (cookies) opts.headers["Cookie"] = cookies;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(`expected ${expectStatus}, got ${res.status}: ${text.slice(0, 200)}`);
  }
  return { status: res.status, json, text, headers: res.headers };
}

function extractCookies(setCookieHeaders) {
  const cookies = [];
  if (typeof setCookieHeaders === "string") {
    cookies.push(setCookieHeaders.split(";")[0]);
  } else if (setCookieHeaders) {
    for (const c of setCookieHeaders) cookies.push(c.split(";")[0]);
  }
  return cookies.join("; ");
}

async function testPages() {
  console.log("\n--- Pages ---");
  const pages = [
    "/", "/m", "/m/login", "/m/register", "/m/auction", "/m/drying", "/m/orders", "/m/me",
    "/admin/login",
  ];
  for (const p of pages) {
    try {
      const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
      if (res.status === 200 || res.status === 307 || res.status === 308) ok(`GET ${p} → ${res.status}`);
      else fail(`GET ${p}`, `status ${res.status}`);
    } catch (e) {
      fail(`GET ${p}`, e.message);
    }
  }
}

async function testAuth() {
  console.log("\n--- Auth ---");
  try {
    const bad = await req("POST", "/api/auth/login", { body: { phone: "", password: "" }, expectStatus: 400 });
    ok("login invalid input → 400");
  } catch (e) { fail("login invalid input", e.message); }

  try {
    const bad = await req("POST", "/api/auth/login", { body: { phone: "13800138000", password: "wrong" }, expectStatus: 401 });
    ok("login wrong password → 401");
  } catch (e) { fail("login wrong password", e.message); }

  let userCookies = "";
  try {
    const res = await req("POST", "/api/auth/login", { body: { phone: "13800138000", password: "user123" }, expectStatus: 200 });
    userCookies = extractCookies(res.headers.getSetCookie?.() || res.headers.get("set-cookie"));
    if (!userCookies.includes("sishi_user_session")) throw new Error("no session cookie");
    ok("user login → 200 + cookie");
  } catch (e) { fail("user login", e.message); }

  let adminCookies = "";
  try {
    const res = await req("POST", "/api/auth/admin/login", { body: { phone: "13900000001", password: "admin123" }, expectStatus: 200 });
    adminCookies = extractCookies(res.headers.getSetCookie?.() || res.headers.get("set-cookie"));
    if (!adminCookies.includes("sishi_admin_session")) throw new Error("no admin session cookie");
    ok("admin login → 200 + cookie");
  } catch (e) { fail("admin login", e.message); }

  return { userCookies, adminCookies };
}

async function testProtectedRoutes(userCookies) {
  console.log("\n--- Protected API ---");
  try {
    await req("POST", "/api/m/auction/1/bid", { body: { amount: 100 }, expectStatus: 401 });
    ok("bid without auth → 401");
  } catch (e) { fail("bid without auth", e.message); }

  try {
    await req("POST", "/api/m/drying/reserve", { body: {}, expectStatus: 401 });
    ok("reserve without auth → 401");
  } catch (e) { fail("reserve without auth", e.message); }

  try {
    await req("POST", "/api/m/payments/mock", { body: {}, expectStatus: 401 });
    ok("payment without auth → 401");
  } catch (e) { fail("payment without auth", e.message); }

  // Admin pages redirect without cookie
  try {
    const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
    if (res.status === 307 || res.status === 308) ok("admin without cookie → redirect");
    else fail("admin without cookie", `status ${res.status}`);
  } catch (e) { fail("admin without cookie", e.message); }

  return userCookies;
}

async function testUpload() {
  console.log("\n--- Upload ---");
  try {
    const res = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (res.status === 400) ok("upload non-multipart → 400");
    else fail("upload non-multipart", `status ${res.status}`);
  } catch (e) { fail("upload non-multipart", e.message); }
}

async function testDevToken() {
  console.log("\n--- Dev Token ---");
  try {
    const res = await req("GET", "/api/dev/third-party-token?u_id=test-user-1", { expectStatus: 200 });
    if (res.json?.token) ok("dev third-party token → 200 + token");
    else fail("dev third-party token", "no token in response");
  } catch (e) { fail("dev third-party token", e.message); }
}

async function testAuctionFlow(userCookies) {
  console.log("\n--- Auction Flow ---");
  // Find a LIVE auction project
  try {
    const page = await fetch(`${BASE}/m/auction`, { headers: { Cookie: userCookies } });
    const html = await page.text();
    const match = html.match(/\/m\/auction\/([a-z0-9]+)/i);
    if (!match) {
      fail("find auction project", "no auction link in /m/auction");
      return;
    }
    const projectId = match[1];
    ok(`found auction project id=${projectId}`);

    const detail = await fetch(`${BASE}/m/auction/${projectId}`, { headers: { Cookie: userCookies } });
    if (detail.status === 200) ok(`auction detail page → 200`);
    else fail("auction detail page", `status ${detail.status}`);
  } catch (e) { fail("auction flow", e.message); }
}

async function testAdminPages(adminCookies) {
  console.log("\n--- Admin Pages ---");
  const pages = ["/admin", "/admin/assets", "/admin/auctions", "/admin/announcements", "/admin/drying", "/admin/config", "/admin/dict", "/admin/audit"];
  for (const p of pages) {
    try {
      const res = await fetch(`${BASE}${p}`, { headers: { Cookie: adminCookies }, redirect: "manual" });
      if (res.status === 200) ok(`GET ${p} → 200`);
      else fail(`GET ${p}`, `status ${res.status}`);
    } catch (e) { fail(`GET ${p}`, e.message); }
  }
}

async function main() {
  console.log(`Smoke test against ${BASE}`);
  await testPages();
  const { userCookies, adminCookies } = await testAuth();
  await testProtectedRoutes(userCookies);
  await testUpload();
  await testDevToken();
  if (userCookies) await testAuctionFlow(userCookies);
  if (adminCookies) await testAdminPages(adminCookies);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (errors.length) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e.name}: ${e.detail}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
