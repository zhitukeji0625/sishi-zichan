#!/usr/bin/env node
/**
 * Functional smoke test — requires dev server at BASE_URL (default http://localhost:3000)
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  errors.push(`${name}: ${detail}`);
  console.log(`  ✗ ${name}: ${detail}`);
}

async function fetchStatus(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...opts });
  return res;
}

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.find((c) => c.startsWith("sishi_admin_session="));
  if (!res.ok || !cookie) throw new Error(`admin login failed: ${res.status}`);
  return cookie.split(";")[0];
}

async function loginUser() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.find((c) => c.startsWith("sishi_user_session="));
  if (!res.ok || !cookie) throw new Error(`user login failed: ${res.status}`);
  return cookie.split(";")[0];
}

async function testPages(name, paths, cookie) {
  for (const path of paths) {
    const res = await fetchStatus(path, {
      headers: cookie ? { Cookie: cookie } : {},
    });
    if (res.status === 200) ok(`${name} ${path}`);
    else fail(`${name} ${path}`, `status ${res.status}`);
  }
}

async function main() {
  console.log(`\nFunctional smoke test @ ${BASE}\n`);

  // Public pages
  await testPages("public", ["/", "/m", "/m/login", "/m/register", "/m/auction", "/m/drying", "/m/me", "/m/orders"]);

  // Admin login page (no cookie)
  const adminLoginRes = await fetchStatus("/admin/login");
  if (adminLoginRes.status === 200) ok("admin /admin/login");
  else fail("admin /admin/login", `status ${adminLoginRes.status}`);

  // Admin pages (with cookie)
  let adminCookie;
  try {
    adminCookie = await loginAdmin();
    ok("admin login API");
  } catch (e) {
    fail("admin login API", e.message);
    return finish();
  }

  await testPages("admin", [
    "/admin",
    "/admin/assets",
    "/admin/assets/new",
    "/admin/auctions",
    "/admin/registrations",
    "/admin/drying",
    "/admin/announcements",
    "/admin/organizations",
    "/admin/admins",
    "/admin/config",
    "/admin/dict",
    "/admin/audit",
  ], adminCookie);

  // User login + H5 detail pages
  let userCookie;
  try {
    userCookie = await loginUser();
    ok("user login API");
  } catch (e) {
    fail("user login API", e.message);
    return finish();
  }

  // Third-party token (dev only)
  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=test-sso-user`);
  if (tokenRes.ok) {
    const data = await tokenRes.json();
    if (data.token) ok("dev third-party-token");
    else fail("dev third-party-token", "no token in response");
  } else {
    fail("dev third-party-token", `status ${tokenRes.status}`);
  }

  // Get auction project from list page or API - query via drying listing
  const dryingRes = await fetch(`${BASE}/m/drying`, { headers: { Cookie: userCookie } });
  if (dryingRes.ok) ok("user /m/drying with session");
  else fail("user /m/drying with session", `status ${dryingRes.status}`);

  // Drying reserve API - need listingId from DB
  const listingId = process.env.TEST_LISTING_ID;
  if (listingId) {
    const reserveRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: "2026-07-01",
        endDate: "2026-07-03",
      }),
    });
    if (reserveRes.ok || reserveRes.status === 409) ok("drying reserve API");
    else {
      const body = await reserveRes.text();
      fail("drying reserve API", `status ${reserveRes.status} ${body.slice(0, 100)}`);
    }
  }

  const auctionId = process.env.TEST_AUCTION_ID;
  if (auctionId) {
    const auctionPage = await fetchStatus(`/m/auction/${auctionId}`, { headers: { Cookie: userCookie } });
    if (auctionPage.status === 200) ok(`user /m/auction/${auctionId}`);
    else fail(`user /m/auction/${auctionId}`, `status ${auctionPage.status}`);

    // Get current bid info - place bid
    const bidRes = await fetch(`${BASE}/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: Number(process.env.TEST_BID_AMOUNT || 8200) }),
    });
    if (bidRes.ok) {
      const data = await bidRes.json();
      if (data.ok) ok("auction bid API");
      else fail("auction bid API", JSON.stringify(data));
    } else if (bidRes.status === 409 || bidRes.status === 400) {
      ok("auction bid API (expected rejection)");
    } else {
      const body = await bidRes.text();
      fail("auction bid API", `status ${bidRes.status} ${body.slice(0, 100)}`);
    }

    // Mock payment
    const payRes = await fetch(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId }),
    });
    if (payRes.ok || payRes.status === 409) ok("mock payment API");
    else {
      const body = await payRes.text();
      fail("mock payment API", `status ${payRes.status} ${body.slice(0, 100)}`);
    }
  }

  // Upload without multipart should 400
  const uploadRes = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({}),
  });
  if (uploadRes.status === 400) ok("upload rejects non-multipart");
  else fail("upload rejects non-multipart", `status ${uploadRes.status}`);

  finish();
}

function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
