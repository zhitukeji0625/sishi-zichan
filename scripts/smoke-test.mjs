#!/usr/bin/env node
/**
 * Functional smoke tests for sishi-zichan.
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

async function testPublicPages() {
  console.log("\n[Public pages]");
  const pages = [
    "/",
    "/m",
    "/m/login",
    "/m/register",
    "/m/auction",
    "/m/drying",
    "/admin/login",
  ];
  for (const p of pages) {
    const { res } = await fetchText(`${BASE}${p}`);
    if (res.status === 200) ok(`GET ${p} → 200`);
    else fail(`GET ${p}`, `status ${res.status}`);
  }
}

async function testAdminAuthRedirect() {
  console.log("\n[Admin auth]");
  const { res } = await fetchText(`${BASE}/admin`);
  if (res.status === 307 || res.status === 302) {
    const loc = res.headers.get("location") || "";
    if (loc.includes("/admin/login")) ok("GET /admin redirects to login");
    else fail("GET /admin redirect", `unexpected location: ${loc}`);
  } else fail("GET /admin redirect", `status ${res.status}`);
}

async function testProtectedApi401() {
  console.log("\n[Protected API]");
  const { res, text } = await fetchText(`${BASE}/api/m/auction/fake/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  if (res.status === 401) ok("POST /api/m/auction/bid without auth → 401");
  else fail("POST /api/m/auction/bid without auth", `status ${res.status}: ${text.slice(0, 100)}`);
}

async function testChineseLabels() {
  console.log("\n[Chinese labels]");
  const { res, text } = await fetchText(`${BASE}/m/auction`);
  if (res.status !== 200) {
    fail("Chinese labels on /m/auction", `status ${res.status}`);
    return;
  }
  const checks = ["进行中", "竞拍"];
  for (const label of checks) {
    if (text.includes(label)) ok(`Page contains "${label}"`);
    else fail(`Chinese label`, `missing "${label}" on /m/auction`);
  }
}

async function loginUser() {
  const jar = new Map();
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    jar.set(k.trim(), v);
  }
  const body = await res.json().catch(() => ({}));
  return { res, jar, body };
}

async function loginAdmin() {
  const jar = new Map();
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    jar.set(k.trim(), v);
  }
  const body = await res.json().catch(() => ({}));
  return { res, jar, body };
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function testUserLogin() {
  console.log("\n[User login]");
  const { res, jar, body } = await loginUser();
  if (res.status === 200 && body.ok) ok("POST /api/auth/login → ok");
  else fail("User login", `status ${res.status}: ${JSON.stringify(body)}`);

  if (jar.has("sishi_user_session")) ok("User session cookie set");
  else fail("User session cookie", "missing sishi_user_session");

  const { res: meRes } = await fetchText(`${BASE}/m/me`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  if (meRes.status === 200) ok("GET /m/me with session → 200");
  else fail("GET /m/me", `status ${meRes.status}`);

  return jar;
}

async function testAdminLogin() {
  console.log("\n[Admin login]");
  const { res, jar, body } = await loginAdmin();
  if (res.status === 200 && body.ok) ok("POST /api/auth/admin/login → ok");
  else fail("Admin login", `status ${res.status}: ${JSON.stringify(body)}`);

  if (jar.has("sishi_admin_session")) ok("Admin session cookie set");
  else fail("Admin session cookie", "missing sishi_admin_session");

  const { res: adminRes } = await fetchText(`${BASE}/admin`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  if (adminRes.status === 200) ok("GET /admin with session → 200");
  else fail("GET /admin", `status ${adminRes.status}`);

  return jar;
}

async function testAuctionBid(userJar) {
  console.log("\n[Auction bid]");
  const { text: auctionPage } = await fetchText(`${BASE}/m/auction`, {
    headers: { Cookie: cookieHeader(userJar) },
  });
  const match = auctionPage.match(/\/m\/auction\/(c[a-z0-9]{20,})/i);
  if (!match) {
    fail("Find live auction", "no auction link on /m/auction");
    return;
  }
  const projectId = match[1];
  ok(`Found auction project ${projectId}`);

  const { res: detailRes, text: detailText } = await fetchText(`${BASE}/m/auction/${projectId}`, {
    headers: { Cookie: cookieHeader(userJar) },
  });
  if (detailRes.status === 200) ok(`GET /m/auction/${projectId} → 200`);
  else fail(`GET /m/auction/${projectId}`, `status ${detailRes.status}`);

  const minBidMatch = detailText.match(/最低[^0-9]*(\d+(?:\.\d+)?)/);
  const bidAmount = minBidMatch ? parseFloat(minBidMatch[1]) : 10000;

  const bidRes = await fetch(`${BASE}/api/m/auction/${projectId}/bid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(userJar),
    },
    body: JSON.stringify({ amount: bidAmount }),
  });
  const bidBody = await bidRes.json().catch(() => ({}));
  if (bidRes.status === 200 && bidBody.ok) ok("POST bid → ok");
  else fail("POST bid", `status ${bidRes.status}: ${JSON.stringify(bidBody)}`);
}

async function testDryingReserve(userJar) {
  console.log("\n[Drying reserve]");
  const { text: dryingPage } = await fetchText(`${BASE}/m/drying`, {
    headers: { Cookie: cookieHeader(userJar) },
  });
  const match = dryingPage.match(/\/m\/drying\/(c[a-z0-9]{20,})/i);
  if (!match) {
    fail("Find drying listing", "no listing link on /m/drying");
    return;
  }
  const listingId = match[1];
  ok(`Found drying listing ${listingId}`);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const res = await fetch(`${BASE}/api/m/drying/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(userJar),
    },
    body: JSON.stringify({
      listingId,
      startDate: fmt(tomorrow),
      endDate: fmt(dayAfter),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 200 && body.ok) ok("POST drying reserve → ok");
  else if (res.status === 400 && body.error?.includes("已满")) ok("POST drying reserve → capacity full (acceptable)");
  else fail("POST drying reserve", `status ${res.status}: ${JSON.stringify(body)}`);
}

async function testThirdPartyToken() {
  console.log("\n[Third-party SSO]");
  const { res, text } = await fetchText(`${BASE}/api/dev/third-party-token?u_id=test-sso-user`);
  if (res.status !== 200) {
    fail("GET third-party-token", `status ${res.status}`);
    return;
  }
  let token;
  try {
    const json = JSON.parse(text);
    token = json.token;
  } catch {
    fail("Parse third-party-token", text.slice(0, 100));
    return;
  }
  if (token) ok("GET third-party-token → token");
  else {
    fail("third-party-token", "no token in response");
    return;
  }

  const { res: ssoRes } = await fetchText(`${BASE}/m/sso?token=${encodeURIComponent(token)}`);
  if (ssoRes.status === 200 || ssoRes.status === 307 || ssoRes.status === 302) {
    ok("GET /m/sso?token=... → redirect or 200");
  } else fail("GET /m/sso", `status ${ssoRes.status}`);
}

async function testAdminPages(adminJar) {
  console.log("\n[Admin pages]");
  const pages = [
    "/admin/assets",
    "/admin/auctions",
    "/admin/drying",
    "/admin/announcements",
    "/admin/organizations",
    "/admin/dict",
    "/admin/audit",
    "/admin/config",
    "/admin/registrations",
    "/admin/admins",
  ];
  for (const p of pages) {
    const { res } = await fetchText(`${BASE}${p}`, {
      headers: { Cookie: cookieHeader(adminJar) },
    });
    if (res.status === 200) ok(`GET ${p} → 200`);
    else fail(`GET ${p}`, `status ${res.status}`);
  }
}

async function testInvalidLogin() {
  console.log("\n[Invalid login]");
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
  });
  if (res.status === 401) ok("Wrong password → 401");
  else fail("Wrong password", `status ${res.status}`);
}

async function main() {
  console.log(`Smoke tests against ${BASE}`);
  try {
    await testPublicPages();
    await testAdminAuthRedirect();
    await testProtectedApi401();
    await testChineseLabels();
    await testInvalidLogin();
    const userJar = await testUserLogin();
    const adminJar = await testAdminLogin();
    await testAuctionBid(userJar);
    await testDryingReserve(userJar);
    await testThirdPartyToken();
    await testAdminPages(adminJar);
  } catch (e) {
    fail("Unexpected error", e.message);
    console.error(e);
  }

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }
  console.log("All smoke tests passed!");
}

main();
