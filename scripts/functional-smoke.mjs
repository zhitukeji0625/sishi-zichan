#!/usr/bin/env node
/**
 * Functional smoke test — requires dev server running on BASE_URL (default http://localhost:3000)
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

async function fetchStatus(url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  return res.status;
}

async function login(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const cookie = res.headers.getSetCookie?.() ?? [];
  const cookieHeader = cookie.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, data, cookieHeader };
}

function mergeIds(...sources) {
  const result = { auctionId: null, dryingId: null, announcementId: null };
  for (const s of sources) {
    if (s.auctionId) result.auctionId = s.auctionId;
    if (s.dryingId) result.dryingId = s.dryingId;
    if (s.announcementId) result.announcementId = s.announcementId;
  }
  return result;
}

function extractIds(html) {
  const auctionIds = [...html.matchAll(/href="\/m\/auction\/(cm[a-z0-9]+)"/g)].map((m) => m[1]);
  const dryingIds = [...html.matchAll(/href="\/m\/drying\/(cm[a-z0-9]+)"/g)].map((m) => m[1]);
  const announcementIds = [...html.matchAll(/href="\/m\/announcements\/(cm[a-z0-9]+)"/g)].map((m) => m[1]);
  return {
    auctionId: auctionIds[0] ?? null,
    dryingId: dryingIds[0] ?? null,
    announcementId: announcementIds[0] ?? null,
  };
}

async function main() {
  console.log(`\n=== Functional smoke test @ ${BASE} ===\n`);

  // Public pages
  console.log("Public pages:");
  for (const path of ["/", "/m", "/m/login", "/m/register", "/admin/login"]) {
    const st = await fetchStatus(`${BASE}${path}`);
    assert(st === 200, `${path} → ${st}`);
  }

  // Admin login + pages
  console.log("\nAdmin:");
  const admin = await login("/api/auth/admin/login", { phone: "13900000001", password: "admin123" });
  assert(admin.status === 200 && admin.data.ok, `admin login → ${admin.status}`);
  const adminCookie = admin.cookieHeader;
  const adminPages = [
    "/admin", "/admin/assets", "/admin/assets/new", "/admin/auctions",
    "/admin/drying", "/admin/registrations", "/admin/announcements",
    "/admin/organizations", "/admin/admins", "/admin/config",
    "/admin/audit", "/admin/dict",
  ];
  for (const path of adminPages) {
    const st = await fetchStatus(`${BASE}${path}`, { headers: { Cookie: adminCookie } });
    assert(st === 200, `${path} → ${st}`);
  }

  // Non-multipart asset create should fail gracefully
  const badAsset = await fetch(`${BASE}/api/admin/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ orgId: "x", type: "LAND", name: "test", locationText: "loc" }),
  });
  assert(badAsset.status === 400, `non-multipart asset create → ${badAsset.status} (expect 400)`);

  // User login + H5 pages
  console.log("\nH5 user:");
  const user = await login("/api/auth/login", { phone: "13800138000", password: "user123" });
  assert(user.status === 200 && user.data.ok, `user login → ${user.status}`);
  const userCookie = user.cookieHeader;

  const h5Pages = ["/m", "/m/auction", "/m/drying", "/m/me", "/m/orders"];
  for (const path of h5Pages) {
    const st = await fetchStatus(`${BASE}${path}`, { headers: { Cookie: userCookie } });
    assert(st === 200, `${path} → ${st}`);
  }

  // Parse IDs from HTML
  const auctionHtml = await (await fetch(`${BASE}/m/auction`, { headers: { Cookie: userCookie } })).text();
  const dryingHtml = await (await fetch(`${BASE}/m/drying`, { headers: { Cookie: userCookie } })).text();
  const mHtml = await (await fetch(`${BASE}/m`, { headers: { Cookie: userCookie } })).text();
  const ids = mergeIds(
    extractIds(auctionHtml),
    extractIds(dryingHtml),
    extractIds(mHtml),
  );
  console.log(`  IDs: auction=${ids.auctionId}, drying=${ids.dryingId}`);

  if (ids.auctionId) {
    const detailSt = await fetchStatus(`${BASE}/m/auction/${ids.auctionId}`, { headers: { Cookie: userCookie } });
    assert(detailSt === 200, `/m/auction/${ids.auctionId} → ${detailSt}`);

    // Probe bid to get minimum amount from server error message
    const probeRes = await fetch(`${BASE}/api/m/auction/${ids.auctionId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: 1 }),
    });
    const probeData = await probeRes.json().catch(() => ({}));
    const minMatch = probeData.error?.match(/不低于 ([\d.]+)/);
    const bidAmount = minMatch ? parseFloat(minMatch[1]) : 8200;

    const bidRes = await fetch(`${BASE}/api/m/auction/${ids.auctionId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: bidAmount }),
    });
    const bidData = await bidRes.json().catch(() => ({}));
    assert(bidRes.status === 200 && bidData.ok && bidData.bidId, `place bid ${bidAmount} → ${bidRes.status} ${JSON.stringify(bidData)}`);

    // Mock payment deposit (may be 409 if already paid)
    const payRes = await fetch(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: ids.auctionId }),
    });
    assert(payRes.status === 200 || payRes.status === 409, `mock deposit → ${payRes.status}`);
  } else {
    console.error("  ⚠ No LIVE auction found — skipping bid/payment tests");
  }

  if (ids.dryingId) {
    const dryingDetailSt = await fetchStatus(`${BASE}/m/drying/${ids.dryingId}`, { headers: { Cookie: userCookie } });
    assert(dryingDetailSt === 200, `/m/drying/${ids.dryingId} → ${dryingDetailSt}`);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const end = new Date(tomorrow);
    end.setDate(end.getDate() + 1);
    const reserveRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId: ids.dryingId,
        startDate: tomorrow.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    const reserveData = await reserveRes.json().catch(() => ({}));
    assert(reserveRes.status === 200 && reserveData.ok, `drying reserve → ${reserveRes.status} ${JSON.stringify(reserveData)}`);
  } else {
    console.error("  ⚠ No drying listing found — skipping reserve test");
  }

  // Third-party token (dev only)
  const tokenSt = await fetchStatus(`${BASE}/api/dev/third-party-token?u_id=test-user`);
  assert(tokenSt === 200, `dev third-party-token → ${tokenSt}`);

  // Unauthenticated API should 401
  const unauthBid = await fetchStatus(`${BASE}/api/m/auction/fake/bid`, { method: "POST" });
  assert(unauthBid === 401, `unauth bid → ${unauthBid}`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
