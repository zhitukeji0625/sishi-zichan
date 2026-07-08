#!/usr/bin/env node
/**
 * Smoke tests for sishi-zichan — run against `npm start` on localhost:3000
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const isProd = process.env.NODE_ENV === "production" || process.env.SMOKE_PROD === "1";

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

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

function getCookie(res, name) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function main() {
  console.log(`\nSmoke tests against ${BASE}${isProd ? " (production mode)" : ""}\n`);

  // 1. Public pages
  for (const path of ["/", "/m", "/admin/login", "/m/login", "/m/auction", "/m/drying"]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 200) ok(`GET ${path} → 200`);
    else fail(`GET ${path}`, `expected 200, got ${res.status}`);
  }

  // 2. Admin login
  const adminLogin = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookie = getCookie(adminLogin.res, "sishi_admin_session");
  if (adminLogin.res.status === 200 && adminCookie) ok("Admin login");
  else fail("Admin login", `status=${adminLogin.res.status}, cookie=${!!adminCookie}`);

  // 3. Admin protected page
  if (adminCookie) {
    const adminPage = await fetch(`${BASE}/admin`, {
      headers: { Cookie: adminCookie },
    });
    if (adminPage.status === 200) ok("GET /admin (authenticated) → 200");
    else fail("GET /admin (authenticated)", `got ${adminPage.status}`);
  }

  // 4. User login
  const userLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const userCookie = getCookie(userLogin.res, "sishi_user_session");
  if (userLogin.res.status === 200 && userCookie) ok("User login");
  else fail("User login", `status=${userLogin.res.status}, cookie=${!!userCookie}`);

  // 5. Third-party token (dev only)
  const tpToken = await fetchJson("/api/dev/third-party-token?u_id=test-smoke");
  if (isProd) {
    if (tpToken.res.status === 404) ok("Dev third-party token disabled in production");
    else fail("Dev third-party token", `expected 404 in prod, got ${tpToken.res.status}`);
  } else if (tpToken.res.status === 200 && tpToken.body?.token) {
    ok("Dev third-party token");
    const tpLogin = await fetchJson("/api/auth/third-party", {
      method: "POST",
      body: JSON.stringify({ token: tpToken.body.token }),
    });
    if (tpLogin.res.status === 200) ok("Third-party login");
    else fail("Third-party login", `status=${tpLogin.res.status}`);
  } else {
    fail("Dev third-party token", `status=${tpToken.res.status}`);
  }

  // 6. Fetch live auction project id from page
  let liveProjectId = null;
  const auctionHtml = await (await fetch(`${BASE}/m/auction`)).text();
  const m = auctionHtml.match(/\/m\/auction\/(c[a-z0-9]{20,})/i);
  if (m) liveProjectId = m[1];

  // 7. Place bid
  if (userCookie && liveProjectId) {
    const bidRes = await fetchJson(`/api/m/auction/${liveProjectId}/bid`, {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({ amount: 999999 }),
    });
    if (bidRes.res.status === 200) ok("Place bid succeeds");
    else if ([400, 409].includes(bidRes.res.status)) ok(`Place bid API responds (${bidRes.res.status})`);
    else fail("Place bid API", `status=${bidRes.res.status}, body=${JSON.stringify(bidRes.body)}`);
  } else if (!liveProjectId) {
    ok("Place bid skipped (no LIVE auction on page)");
  }

  // 8. Drying reserve
  if (userCookie) {
    const dryingHtml = await (await fetch(`${BASE}/m/drying`, { headers: { Cookie: userCookie } })).text();
    const lm = dryingHtml.match(/\/m\/drying\/(c[a-z0-9]{20,})/i);
    const listingId = lm?.[1];
    if (listingId) {
      const start = new Date();
      start.setDate(start.getDate() + 10);
      const end = new Date(start);
      end.setDate(end.getDate() + 2);
      const reserveRes = await fetchJson("/api/m/drying/reserve", {
        method: "POST",
        headers: { Cookie: userCookie },
        body: JSON.stringify({
          listingId,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
        }),
      });
      if (reserveRes.res.status === 200) ok("Drying reserve succeeds");
      else if ([400, 409].includes(reserveRes.res.status)) ok(`Drying reserve API responds (${reserveRes.res.status})`);
      else fail("Drying reserve API", `status=${reserveRes.res.status}, body=${JSON.stringify(reserveRes.body)}`);

      // duplicate should 409
      const dupRes = await fetchJson("/api/m/drying/reserve", {
        method: "POST",
        headers: { Cookie: userCookie },
        body: JSON.stringify({
          listingId,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
        }),
      });
      if (dupRes.res.status === 409) ok("Duplicate drying reserve → 409");
      else if (reserveRes.res.status !== 200) ok("Duplicate drying reserve skipped");
      else fail("Duplicate drying reserve", `expected 409, got ${dupRes.res.status}`);
    } else {
      ok("Drying reserve skipped (no listing found)");
    }
  }

  // 9. Mock payment (already paid deposit should 409)
  if (userCookie && liveProjectId) {
    const payRes = await fetchJson("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: liveProjectId }),
    });
    if (payRes.res.status === 409) ok("Mock payment deposit already paid → 409");
    else if ([200, 400, 403].includes(payRes.res.status)) ok(`Mock payment API responds (${payRes.res.status})`);
    else fail("Mock payment API", `status=${payRes.res.status}, body=${JSON.stringify(payRes.body)}`);
  }

  // 10. Upload without multipart → 400
  if (adminCookie) {
    const uploadRes = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (uploadRes.status === 400) ok("Upload non-multipart → 400");
    else fail("Upload non-multipart", `expected 400, got ${uploadRes.status}`);
  }

  // 11. Admin assets API non-multipart → 400
  if (adminCookie) {
    const assetsRes = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (assetsRes.status === 400) ok("Admin assets non-multipart → 400");
    else fail("Admin assets non-multipart", `expected 400, got ${assetsRes.status}`);
  }

  // 12. Unauthenticated admin page blocked
  const unauthAdmin = await fetch(`${BASE}/admin/assets`, { redirect: "manual" });
  if ([302, 307, 401, 403].includes(unauthAdmin.status)) ok("Unauthenticated /admin/assets blocked");
  else fail("Unauthenticated /admin/assets", `expected redirect/401, got ${unauthAdmin.status}`);

  // 13. Unauthenticated mobile API → 401
  const unauthBid = await fetchJson("/api/m/auction/x/bid", {
    method: "POST",
    body: JSON.stringify({ amount: 100 }),
  });
  if (unauthBid.res.status === 401) ok("Unauthenticated bid → 401");
  else fail("Unauthenticated bid", `expected 401, got ${unauthBid.res.status}`);

  // 14. Register validation
  const badReg = await fetchJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ phone: "123", password: "x" }),
  });
  if (badReg.res.status === 400) ok("Register validation → 400");
  else fail("Register validation", `expected 400, got ${badReg.res.status}`);

  // 15. Dict page loads
  if (adminCookie) {
    const dictRes = await fetch(`${BASE}/admin/dict`, { headers: { Cookie: adminCookie } });
    if (dictRes.status === 200) ok("GET /admin/dict → 200");
    else fail("GET /admin/dict", `got ${dictRes.status}`);
  }

  // 16. Logout
  if (userCookie) {
    const logoutRes = await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { Cookie: userCookie } });
    if (logoutRes.status === 200) ok("User logout");
    else fail("User logout", `got ${logoutRes.status}`);
  }
  if (adminCookie) {
    const logoutRes = await fetch(`${BASE}/api/auth/admin/logout`, { method: "POST", headers: { Cookie: adminCookie } });
    if (logoutRes.status === 200) ok("Admin logout");
    else fail("Admin logout", `got ${logoutRes.status}`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (errors.length) {
    console.log("Failures:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
