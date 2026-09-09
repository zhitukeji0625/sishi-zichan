#!/usr/bin/env node
/**
 * HTTP smoke tests — run against `npm run dev` (http://localhost:3000).
 * Usage: node scripts/smoke-test.mjs
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function assert(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name}: ${detail}` : name;
    errors.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

async function fetchStatus(url, opts = {}) {
  const res = await fetch(url, { redirect: "follow", ...opts });
  return { status: res.status, res };
}

async function fetchJson(url, opts = {}) {
  const { status, res } = await fetchStatus(url, opts);
  const body = await res.json().catch(() => null);
  return { status, body, res };
}

async function main() {
  console.log(`Smoke tests @ ${BASE}\n`);

  // --- Public pages (8) ---
  console.log("Public pages:");
  for (const path of ["/", "/m", "/m/auction", "/m/drying", "/m/me", "/m/login", "/m/register", "/admin/login"]) {
    const { status } = await fetchStatus(`${BASE}${path}`);
    assert(`${path} returns 200`, status === 200, `got ${status}`);
  }

  // --- Auth (4) ---
  console.log("\nAuth:");
  const badLogin = await fetchJson(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "", password: "" }),
  });
  assert("user login rejects empty", badLogin.status === 400);

  const userLogin = await fetchJson(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  assert("user login succeeds", userLogin.status === 200 && userLogin.body?.ok === true);
  const userCookie = userLogin.res.headers.getSetCookie?.() ?? [];
  const userCookieHeader = userCookie.map((c) => c.split(";")[0]).join("; ");

  const adminLogin = await fetchJson(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  assert("admin login succeeds", adminLogin.status === 200 && adminLogin.body?.ok === true);
  const adminCookie = adminLogin.res.headers.getSetCookie?.() ?? [];
  const adminCookieHeader = adminCookie.map((c) => c.split(";")[0]).join("; ");

  const badAdmin = await fetchJson(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "wrong" }),
  });
  assert("admin login rejects bad password", badAdmin.status === 401);

  // --- Middleware protection (2) ---
  console.log("\nAuth middleware:");
  const bidNoAuth = await fetchJson(`${BASE}/api/m/auction/fake/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 1000 }),
  });
  assert("bid without session returns 401", bidNoAuth.status === 401);

  const uploadNoAuth = await fetchStatus(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert("upload without session returns 401", uploadNoAuth.status === 401);

  // --- Multipart validation (3) ---
  console.log("\nMultipart validation:");
  const uploadBad = await fetchJson(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookieHeader },
    body: "{}",
  });
  assert("upload non-multipart returns 400", uploadBad.status === 400);

  const assetBad = await fetchJson(`${BASE}/api/admin/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookieHeader },
    body: "{}",
  });
  assert("asset create non-multipart returns 400", assetBad.status === 400);

  const assetUpdateBad = await fetchJson(`${BASE}/api/admin/assets/fake-id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookieHeader },
    body: "{}",
  });
  assert("asset update non-multipart returns 400", assetUpdateBad.status === 400);

  // --- Admin pages (5) ---
  console.log("\nAdmin pages:");
  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/dict", "/admin/audit"]) {
    const { status } = await fetchStatus(`${BASE}${path}`, {
      headers: { Cookie: adminCookieHeader },
    });
    assert(`${path} returns 200`, status === 200, `got ${status}`);
  }

  // --- Dev token (1) ---
  console.log("\nDev tools:");
  const devToken = await fetchJson(`${BASE}/api/dev/third-party-token?u_id=smoke`);
  assert("dev third-party token", devToken.status === 200 && devToken.body?.token);

  // --- Auction bid (2) ---
  console.log("\nAuction:");
  const auctionPage = await fetchStatus(`${BASE}/m/auction`);
  assert("/m/auction page loads", auctionPage.status === 200);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const liveProject = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
  });
  await prisma.$disconnect();

  if (liveProject) {
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: liveProject.id },
      orderBy: { amount: "desc" },
    });
    const start = Number(liveProject.startPrice);
    const step = Number(liveProject.bidStep);
    const minBid = topBid ? Number(topBid.amount) + step : start;
    const bid = await fetchJson(`${BASE}/api/m/auction/${liveProject.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookieHeader },
      body: JSON.stringify({ amount: minBid }),
    });
    assert("bid on live auction succeeds", bid.status === 200 && bid.body?.ok === true, `got ${bid.status} ${JSON.stringify(bid.body)}`);
  } else {
    assert("live auction exists for bid test", false, "no LIVE project — run npm run db:seed");
  }

  const bidInvalid = await fetchJson(`${BASE}/api/m/auction/fake/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookieHeader },
    body: JSON.stringify({ amount: -1 }),
  });
  assert("bid rejects invalid amount", bidInvalid.status === 400);

  // --- Drying reserve (2) ---
  console.log("\nDrying:");
  const listing = await (async () => {
    const p = new PrismaClient();
    const l = await p.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
    await p.$disconnect();
    return l;
  })();

  const start = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  const dryBad = await fetchJson(`${BASE}/api/m/drying/reserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookieHeader },
    body: JSON.stringify({ listingId: "fake", startDate: start, endDate: end }),
  });
  assert("drying reserve rejects fake listing", dryBad.status === 404);

  if (listing) {
    const dryOk = await fetchJson(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookieHeader },
      body: JSON.stringify({ listingId: listing.id, startDate: start, endDate: end }),
    });
    assert("drying reserve succeeds", dryOk.status === 200 && dryOk.body?.ok === true, `got ${dryOk.status}`);
  } else {
    assert("operating drying listing exists", false);
  }

  // --- Payment mock (1) ---
  console.log("\nPayments:");
  const payBad = await fetchJson(`${BASE}/api/m/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookieHeader },
    body: JSON.stringify({ purpose: "INVALID" }),
  });
  assert("mock payment rejects invalid purpose", payBad.status === 400);

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.error("\nFailures:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log("All smoke tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
