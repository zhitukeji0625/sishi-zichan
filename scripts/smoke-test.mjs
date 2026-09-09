#!/usr/bin/env node
/**
 * HTTP smoke tests — run against `npm run dev` (localhost:3000).
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const CUID = /cm[a-z0-9]{20,}/;

let passed = 0;
let failed = 0;

function fail(name, detail) {
  failed++;
  console.error(`FAIL  ${name}: ${detail}`);
}

function pass(name) {
  passed++;
  console.log(`PASS  ${name}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json, text };
}

function cookieHeader(setCookie) {
  if (!setCookie) return "";
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  // 1. Portal homepage
  {
    const { res } = await fetchJson("/");
    if (res.status === 200) pass("GET /");
    else fail("GET /", `status ${res.status}`);
  }

  // 2. Admin login page
  {
    const { res } = await fetchJson("/admin/login");
    if (res.status === 200) pass("GET /admin/login");
    else fail("GET /admin/login", `status ${res.status}`);
  }

  // 3. Mobile home
  {
    const { res } = await fetchJson("/m");
    if (res.status === 200) pass("GET /m");
    else fail("GET /m", `status ${res.status}`);
  }

  // 4. Mobile me (redirect or 200)
  {
    const { res } = await fetchJson("/m/me");
    if (res.status === 200 || res.status === 307 || res.status === 302) pass("GET /m/me");
    else fail("GET /m/me", `status ${res.status}`);
  }

  // 5. Mobile auction list
  {
    const { res } = await fetchJson("/m/auction");
    if (res.status === 200) pass("GET /m/auction");
    else fail("GET /m/auction", `status ${res.status}`);
  }

  // 6. Admin login API — bad creds
  {
    const { res } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "000", password: "bad" }),
    });
    if (res.status === 401) pass("POST /api/auth/admin/login (bad creds → 401)");
    else fail("POST /api/auth/admin/login (bad creds)", `status ${res.status}`);
  }

  // 7. Admin login API — good creds
  let adminCookie = "";
  {
    const { res, json } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminCookie = cookieHeader(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    if (res.status === 200 && json?.ok) pass("POST /api/auth/admin/login");
    else fail("POST /api/auth/admin/login", `status ${res.status} body=${JSON.stringify(json)}`);
  }

  // 8. Upload without multipart → 401 (no cookie) or 400
  {
    const { res } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 401) pass("POST /api/upload (no auth → 401)");
    else fail("POST /api/upload (no auth)", `status ${res.status}`);
  }

  // 9. Upload with admin cookie but non-multipart → 400
  {
    const { res } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    if (res.status === 400) pass("POST /api/upload (non-multipart → 400)");
    else fail("POST /api/upload (non-multipart)", `status ${res.status}`);
  }

  // 10. Admin assets without multipart → 400
  {
    const { res } = await fetchJson("/api/admin/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ name: "x" }),
    });
    if (res.status === 400) pass("POST /api/admin/assets (non-multipart → 400)");
    else fail("POST /api/admin/assets (non-multipart)", `status ${res.status}`);
  }

  // 11. User login
  let userCookie = "";
  {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userCookie = cookieHeader(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    if (res.status === 200 && json?.ok) pass("POST /api/auth/login");
    else fail("POST /api/auth/login", `status ${res.status}`);
  }

  // 12. Extract auction project id from /m/auction page
  let projectId = "";
  {
    const { res, text } = await fetchJson("/m/auction");
    const match = text.match(CUID);
    projectId = match?.[0] ?? "";
    if (projectId) pass(`GET /m/auction (found project ${projectId})`);
    else fail("GET /m/auction (project id)", "no cuid found");
  }

  // 13. Auction detail page
  if (projectId) {
    const { res } = await fetchJson(`/m/auction/${projectId}`);
    if (res.status === 200) pass(`GET /m/auction/${projectId}`);
    else fail(`GET /m/auction/${projectId}`, `status ${res.status}`);
  }

  // 14. Place bid
  if (projectId && userCookie) {
    const { res, json } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: 8000 }),
    });
    if (res.status === 200 && json?.ok) pass("POST bid");
    else if (res.status === 400 && json?.error?.includes("出价")) pass("POST bid (already at price)");
    else fail("POST bid", `status ${res.status} ${JSON.stringify(json)}`);
  }

  // 15. Drying page
  let listingId = "";
  {
    const { res, text } = await fetchJson("/m/drying");
    const match = text.match(CUID);
    listingId = match?.[0] ?? "";
    if (res.status === 200) pass("GET /m/drying");
    else fail("GET /m/drying", `status ${res.status}`);
    if (!listingId) fail("GET /m/drying (listing id)", "no cuid found");
  }

  // 16–17. Drying reservation + duplicate overlap → 409
  let reservationId = "";
  const reserveOffset = 10 + Math.floor(Math.random() * 20);
  const reserveStart = new Date();
  reserveStart.setDate(reserveStart.getDate() + reserveOffset);
  const reserveEnd = new Date(reserveStart);
  reserveEnd.setDate(reserveEnd.getDate() + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);

  if (listingId && userCookie) {
    const { res, json } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: fmt(reserveStart),
        endDate: fmt(reserveEnd),
      }),
    });
    if (res.status === 200 && json?.ok) {
      pass("POST /api/m/drying/reserve");
      reservationId = json.id;
    } else if (res.status === 400) pass("POST /api/m/drying/reserve (capacity full ok)");
    else fail("POST /api/m/drying/reserve", `status ${res.status} ${JSON.stringify(json)}`);
  }

  // 17. Duplicate overlapping reservation → 409
  if (listingId && userCookie) {
    const start = reserveStart;
    const end = reserveEnd;
    const fmt = (d) => d.toISOString().slice(0, 10);
    const { res } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: fmt(start),
        endDate: fmt(end),
      }),
    });
    if (res.status === 409) pass("POST /api/m/drying/reserve duplicate → 409");
    else if (res.status === 400) pass("POST /api/m/drying/reserve duplicate → 400 (capacity)");
    else fail("POST /api/m/drying/reserve duplicate", `expected 409, got ${res.status}`);
  }

  // 18. Dev third-party token
  {
    const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=test-smoke");
    if (res.status === 200 && json?.token) pass("GET /api/dev/third-party-token");
    else fail("GET /api/dev/third-party-token", `status ${res.status}`);
  }

  // 19. Admin dashboard
  {
    const { res } = await fetchJson("/admin", {
      headers: { Cookie: adminCookie },
    });
    if (res.status === 200) pass("GET /admin (authenticated)");
    else fail("GET /admin", `status ${res.status}`);
  }

  // 20. Admin logout
  {
    const { res } = await fetchJson("/api/auth/admin/logout", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    if (res.status === 200) pass("POST /api/auth/admin/logout");
    else fail("POST /api/auth/admin/logout", `status ${res.status}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
