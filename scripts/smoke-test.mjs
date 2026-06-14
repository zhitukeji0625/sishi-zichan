#!/usr/bin/env node
/**
 * Smoke test for sishi-zichan completeness.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";

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

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  const text = await res.text();
  return { res, text };
}

async function testPages() {
  console.log("\n--- Pages (unauthenticated) ---");
  const pages = [
    ["/", 200],
    ["/m", 200],
    ["/m/login", 200],
    ["/m/register", 200],
    ["/m/auction", 200],
    ["/m/drying", 200],
    ["/admin/login", 200],
    ["/admin", 307],
    ["/admin/assets", 307],
    ["/m/me", 307],
    ["/m/orders", 307],
  ];
  for (const [path, expectStatus] of pages) {
    try {
      const { res } = await fetchText(`${BASE}${path}`);
      if (res.status === expectStatus) ok(`${path} → ${expectStatus}`);
      else fail(`${path}`, `expected ${expectStatus}, got ${res.status}`);
    } catch (e) {
      fail(path, e.message);
    }
  }
}

async function testApiUnauth() {
  console.log("\n--- API (unauthenticated) ---");
  try {
    const { res, text } = await fetchText(`${BASE}/api/m/auction/1/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    if (res.status === 401) ok("POST /api/m/auction/1/bid → 401");
    else fail("POST /api/m/auction/1/bid", `expected 401, got ${res.status}: ${text.slice(0, 100)}`);
  } catch (e) {
    fail("POST /api/m/auction/1/bid", e.message);
  }

  try {
    const { res } = await fetchText(`${BASE}/api/dev/third-party-token?u_id=demo`);
    if (res.status === 200) ok("GET /api/dev/third-party-token → 200");
    else fail("/api/dev/third-party-token", `expected 200, got ${res.status}`);
  } catch (e) {
    fail("/api/dev/third-party-token", e.message);
  }
}

function parseCookies(setCookieHeaders) {
  const cookies = {};
  for (const h of setCookieHeaders) {
    const [pair] = h.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return cookies;
}

function extractSetCookies(res) {
  if (typeof res.headers.getSetCookie === "function") {
    return res.headers.getSetCookie();
  }
  const raw = res.headers.get("set-cookie");
  return raw ? raw.split(/,(?=[^;]+?=)/) : [];
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const raw = extractSetCookies(res);
  const cookies = parseCookies(raw);
  const data = await res.json();
  return { res, cookies, data };
}

async function loginUser() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const raw = extractSetCookies(res);
  const cookies = parseCookies(raw);
  const data = await res.json();
  return { res, cookies, data };
}

async function testAdminLogin() {
  console.log("\n--- Admin login & pages ---");
  const { res, cookies, data } = await loginAdmin();
  if (res.ok && data.ok !== false) ok("Admin login API");
  else {
    fail("Admin login API", `${res.status} ${JSON.stringify(data)}`);
    return null;
  }

  const adminPages = [
    "/admin",
    "/admin/assets",
    "/admin/assets/new",
    "/admin/auctions",
    "/admin/registrations",
    "/admin/announcements",
    "/admin/drying",
    "/admin/organizations",
    "/admin/admins",
    "/admin/config",
    "/admin/dict",
    "/admin/audit",
  ];
  const hdr = { Cookie: cookieHeader(cookies) };
  for (const path of adminPages) {
    try {
      const { res: r, text } = await fetchText(`${BASE}${path}`, { headers: hdr });
      if (r.status === 200 && !text.includes("Application error")) ok(`Admin ${path}`);
      else fail(`Admin ${path}`, `status=${r.status}`);
    } catch (e) {
      fail(`Admin ${path}`, e.message);
    }
  }
  return cookies;
}

async function testUserLogin() {
  console.log("\n--- User login & pages ---");
  const { res, cookies, data } = await loginUser();
  if (res.ok && data.ok !== false) ok("User login API");
  else {
    fail("User login API", `${res.status} ${JSON.stringify(data)}`);
    return null;
  }

  const hdr = { Cookie: cookieHeader(cookies) };
  for (const path of ["/m/me", "/m/orders"]) {
    try {
      const { res: r, text } = await fetchText(`${BASE}${path}`, { headers: hdr });
      if (r.status === 200 && !text.includes("Application error")) ok(`User ${path}`);
      else fail(`User ${path}`, `status=${r.status}`);
    } catch (e) {
      fail(`User ${path}`, e.message);
    }
  }
  return cookies;
}

async function testDictLabels() {
  console.log("\n--- Dict Chinese labels ---");
  const { text } = await fetchText(`${BASE}/m/auction`);
  const labels = ["进行中", "已结束", "待开始"];
  let found = 0;
  for (const label of labels) {
    if (text.includes(label)) found++;
  }
  const rawEnums = ["LIVE", "ENDED", "SCHEDULED"].filter((e) => text.includes(`>${e}<`));
  if (found >= 1 && rawEnums.length === 0) ok(`Auction page uses Chinese status labels (${found} found)`);
  else if (rawEnums.length > 0) fail("Dict Chinese labels", `raw enums shown: ${rawEnums.join(", ")}`);
  else fail("Dict Chinese labels", `no Chinese labels found on /m/auction`);
}

async function testAuctionDetail() {
  console.log("\n--- Auction & drying detail pages ---");
  const { text: auctionList } = await fetchText(`${BASE}/m/auction`);
  const idMatch = auctionList.match(/href="\/m\/auction\/([^"?]+)"/);
  if (idMatch && idMatch[1] !== "") {
    const id = idMatch[1];
    const { res, text } = await fetchText(`${BASE}/m/auction/${id}`);
    if (res.status === 200 && !text.includes("Application error")) ok(`/m/auction/${id}`);
    else fail(`/m/auction/${id}`, `status=${res.status}`);
  } else {
    fail("Auction detail", "no auction link found on /m/auction");
  }

  const { text: dryingList } = await fetchText(`${BASE}/m/drying`);
  const dryMatch = dryingList.match(/href="\/m\/drying\/([^"]+)"/);
  if (dryMatch && dryMatch[1] !== "") {
    const id = dryMatch[1];
    const { res, text } = await fetchText(`${BASE}/m/drying/${id}`);
    if (res.status === 200 && !text.includes("Application error")) ok(`/m/drying/${id}`);
    else fail(`/m/drying/${id}`, `status=${res.status}`);
  } else {
    fail("Drying detail", "no drying link found on /m/drying");
  }
}

async function testInvalidLogin() {
  console.log("\n--- Invalid login ---");
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "00000000000", password: "wrong" }),
  });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 && body.error) ok("Invalid login → 401 with error");
  else fail("Invalid login", `status=${r.status}`);
}

async function main() {
  console.log(`Smoke test @ ${BASE}`);
  await testPages();
  await testApiUnauth();
  await testAdminLogin();
  await testUserLogin();
  await testDictLabels();
  await testAuctionDetail();
  await testInvalidLogin();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (errors.length) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
