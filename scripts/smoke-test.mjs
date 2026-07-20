#!/usr/bin/env node
/**
 * API smoke test for sishi-zichan
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const CUID_RE = /[a-z0-9]{20,}/;

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

function assert(cond, name, detail = "assertion failed") {
  if (cond) ok(name);
  else fail(name, detail);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

function cookieHeader(setCookies) {
  if (!setCookies) return "";
  const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`\nSmoke test → ${BASE}\n`);

  // 1. Public pages
  for (const path of ["/", "/m", "/m/login", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    assert(res.ok, `GET ${path}`, `status ${res.status}`);
  }

  // 2. Third-party token (GET)
  const { res: tpRes, json: tpJson } = await fetchJson("/api/dev/third-party-token?u_id=smoke_test");
  assert(tpRes.ok && tpJson.token, "GET /api/dev/third-party-token");

  // 3. Admin login
  const adminLogin = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookies = cookieHeader(adminLogin.headers.getSetCookie?.() ?? []);
  assert(adminLogin.ok, "POST /api/auth/admin/login", `status ${adminLogin.status}`);

  // 4. User login
  const userLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const userCookies = cookieHeader(userLogin.headers.getSetCookie?.() ?? []);
  assert(userLogin.ok, "POST /api/auth/login", `status ${userLogin.status}`);

  // 5. Third-party auth
  const { res: ssoRes } = await fetchJson("/api/auth/third-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tpJson.token }),
  });
  assert(ssoRes.ok, "POST /api/auth/third-party");

  // 6. Find LIVE auction from /m/auction page
  const auctionPage = await fetch(`${BASE}/m/auction`);
  const auctionHtml = await auctionPage.text();
  const projectIds = [...auctionHtml.matchAll(/\/m\/auction\/([a-z0-9]{20,})/g)].map((m) => m[1]);
  const projectId = projectIds[0];
  assert(projectId, "Find LIVE auction project ID", "no project found on /m/auction");

  // 7. Bid on auction
  if (projectId) {
    const { res: bidRes, json: bidJson } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookies },
      body: JSON.stringify({ amount: 8000 }),
    });
    if (bidRes.ok) {
      ok("POST bid succeeded");
    } else if (bidRes.status === 400 && bidJson.error?.includes("出价")) {
      ok("POST bid rejected as expected (already bid or min increment)");
    } else {
      fail("POST bid", bidJson.error || `status ${bidRes.status}`);
    }
  }

  // 8. Drying listing
  const dryingPage = await fetch(`${BASE}/m/drying`);
  const dryingHtml = await dryingPage.text();
  const listingIds = [...dryingHtml.matchAll(/\/m\/drying\/([a-z0-9]{20,})/g)].map((m) => m[1]);
  const listingId = listingIds[0];
  assert(listingId, "Find drying listing ID");

  // 9. Drying reserve
  if (listingId) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const { res: dryRes, json: dryJson } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookies },
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    assert(dryRes.ok, "POST /api/m/drying/reserve", dryJson.error || `status ${dryRes.status}`);
  }

  // 10. Upload without multipart → should be 400 not 500
  const { res: upRes } = await fetchJson("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookies },
    body: JSON.stringify({}),
  });
  assert(upRes.status === 400 || upRes.status === 401, "POST /api/upload non-multipart returns 400/401", `got ${upRes.status}`);

  // 11. Admin assets without multipart → should be 400 not 500
  const { res: assetRes } = await fetchJson("/api/admin/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookies },
    body: JSON.stringify({ name: "test" }),
  });
  assert(assetRes.status === 400 || assetRes.status === 401, "POST /api/admin/assets non-multipart returns 400/401", `got ${assetRes.status}`);

  // 12. Login validation
  const { res: badLogin } = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "", password: "" }),
  });
  assert(badLogin.status === 400, "POST login empty fields → 400");

  // 13. Unauthenticated bid → 401
  const { res: unauthBid } = await fetchJson(`/api/m/auction/fakeprojectid123456789/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  assert(unauthBid.status === 401, "POST bid without auth → 401");

  // 14. Mock payment invalid params
  const { res: payBad } = await fetchJson("/api/m/payments/mock", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookies },
    body: JSON.stringify({ purpose: "INVALID" }),
  });
  assert(payBad.status === 400, "POST mock payment invalid purpose → 400");

  console.log(`\n${passed} passed, ${failed} failed`);
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
