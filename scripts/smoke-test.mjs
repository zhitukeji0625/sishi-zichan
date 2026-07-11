#!/usr/bin/env node
/**
 * Functional smoke tests against a running dev server (default :3000).
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */

const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function main() {
  console.log(`Smoke tests @ ${BASE}\n`);

  // Public pages
  for (const path of ["/", "/m", "/m/login", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    assert(`GET ${path} -> 200`, res.status === 200, String(res.status));
  }

  // Admin login
  const adminLogin = await jsonFetch("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  assert("admin login", adminLogin.res.status === 200 && adminLogin.body?.ok === true);
  const adminCookie = parseCookies(adminLogin.res);

  const adminPage = await fetch(`${BASE}/admin`, {
    headers: { Cookie: adminCookie },
    redirect: "manual",
  });
  assert("admin dashboard accessible", adminPage.status === 200, String(adminPage.status));

  const adminAssets = await fetch(`${BASE}/admin/assets`, {
    headers: { Cookie: adminCookie },
  });
  assert("admin assets page", adminAssets.status === 200, String(adminAssets.status));

  const adminAuctions = await fetch(`${BASE}/admin/auctions`, {
    headers: { Cookie: adminCookie },
  });
  const auctionsHtml = await adminAuctions.text();
  assert("admin auctions page", adminAuctions.status === 200);
  assert(
    "auction status label (进行中)",
    auctionsHtml.includes("进行中"),
    "expected Chinese dict label",
  );

  // User login
  const userLogin = await jsonFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  assert("user login", userLogin.res.status === 200 && userLogin.body?.ok === true);
  const userCookie = parseCookies(userLogin.res);

  const mAuction = await fetch(`${BASE}/m/auction`, {
    headers: { Cookie: userCookie },
  });
  const mAuctionHtml = await mAuction.text();
  assert("user auction list", mAuction.status === 200);
  assert("user auction LIVE label", mAuctionHtml.includes("进行中"), "expected LIVE label");

  // Find live project id from DB via auction page link pattern
  const projectMatch = mAuctionHtml.match(/\/m\/auction\/([a-z0-9]+)/i);
  assert("found auction project link", !!projectMatch);
  const projectId = projectMatch?.[1];

  if (projectId) {
    const bid = await jsonFetch(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: 8000 }),
    });
    assert("place bid", bid.res.status === 200 && bid.body?.ok === true, JSON.stringify(bid.body));

    const bidAgain = await jsonFetch(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: 8000 }),
    });
    assert(
      "reject duplicate low bid",
      bidAgain.res.status === 400,
      JSON.stringify(bidAgain.body),
    );
  }

  // Drying reserve
  const dryingPage = await fetch(`${BASE}/m/drying`, { headers: { Cookie: userCookie } });
  const dryingHtml = await dryingPage.text();
  assert("drying list page", dryingPage.status === 200);
  const listingMatch = dryingHtml.match(/\/m\/drying\/([a-z0-9]+)/i);
  assert("found drying listing link", !!listingMatch);
  const listingId = listingMatch?.[1];

  if (listingId) {
    const reserve = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: "2026-08-01",
        endDate: "2026-08-03",
      }),
    });
    assert(
      "drying reserve",
      reserve.res.status === 200 && reserve.body?.ok === true,
      JSON.stringify(reserve.body),
    );
  }

  // Mock payment idempotency (deposit already paid for demo user)
  if (projectId) {
    const pay = await jsonFetch("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId }),
    });
    assert(
      "deposit already paid -> 409",
      pay.res.status === 409,
      JSON.stringify(pay.body),
    );
  }

  // Third-party token (dev only)
  const tp = await jsonFetch("/api/dev/third-party-token?u_id=smoke-user");
  assert("third-party token", tp.res.status === 200 && typeof tp.body?.token === "string");

  // Unauthenticated API guard
  const noAuth = await jsonFetch("/api/m/drying/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "x", startDate: "2026-08-01", endDate: "2026-08-02" }),
  });
  assert("unauth reserve -> 401", noAuth.res.status === 401);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
