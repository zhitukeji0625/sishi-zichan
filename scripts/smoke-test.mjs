#!/usr/bin/env node
/**
 * API & page smoke tests for sishi-zichan
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

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
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, json, text };
}

function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const h of setCookieHeaders) {
    const [pair] = h.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function main() {
  console.log(`Smoke tests against ${BASE}\n`);

  // --- Public pages ---
  for (const path of ["/", "/m", "/m/login", "/m/register", "/m/auction", "/m/drying", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    if (res.status === 200 || res.status === 307 || res.status === 308) ok(`GET ${path} → ${res.status}`);
    else fail(`GET ${path}`, `status ${res.status}`);
  }

  // --- Dev third-party token ---
  {
    const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=smoke_test");
    if (res.status === 200 && json?.token) ok("GET /api/dev/third-party-token");
    else fail("GET /api/dev/third-party-token", `${res.status} ${JSON.stringify(json)}`);
  }

  // --- User auth ---
  let userCookies = {};
  {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    userCookies = parseCookies(setCookies);
    const { json } = { json: await res.json() };
    if (res.status === 200 && userCookies.sishi_user_session) ok("POST /api/auth/login");
    else fail("POST /api/auth/login", `${res.status} ${JSON.stringify(json)}`);
  }

  // --- Admin auth ---
  let adminCookies = {};
  {
    const res = await fetch(`${BASE}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    adminCookies = parseCookies(setCookies);
    const json = await res.json();
    if (res.status === 200 && adminCookies.sishi_admin_session) ok("POST /api/auth/admin/login");
    else fail("POST /api/auth/admin/login", `${res.status} ${JSON.stringify(json)}`);
  }

  // --- Protected without auth ---
  {
    const { res } = await fetchJson("/api/m/auction/test/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    if (res.status === 401 || res.status === 403) ok("POST /api/m/auction/*/bid without auth → rejected");
    else fail("POST /api/m/auction/*/bid without auth", `status ${res.status}`);
  }

  // --- Admin page without auth ---
  {
    const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
    if (res.status === 307 || res.status === 308) ok("GET /admin without auth → redirect");
    else fail("GET /admin without auth", `status ${res.status}`);
  }

  // --- Admin page with auth ---
  {
    const res = await fetch(`${BASE}/admin`, {
      headers: { Cookie: cookieHeader(adminCookies) },
      redirect: "manual",
    });
    if (res.status === 200) ok("GET /admin with auth");
    else fail("GET /admin with auth", `status ${res.status}`);
  }

  // --- User pages with auth ---
  for (const path of ["/m/me", "/m/orders"]) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Cookie: cookieHeader(userCookies) },
      redirect: "manual",
    });
    if (res.status === 200) ok(`GET ${path} with auth`);
    else fail(`GET ${path} with auth`, `status ${res.status}`);
  }

  // --- Get live auction from DB via API pages ---
  // Fetch auction list page and extract project id from HTML if possible
  const auctionPage = await fetch(`${BASE}/m/auction`);
  const auctionHtml = await auctionPage.text();
  const idMatch = auctionHtml.match(/\/m\/auction\/(c[a-z0-9]{20,})/i);
  const projectId = idMatch?.[1];

  if (projectId) {
    const detailRes = await fetch(`${BASE}/m/auction/${projectId}`, {
      headers: { Cookie: cookieHeader(userCookies) },
    });
    if (detailRes.status === 200) ok(`GET /m/auction/${projectId}`);
    else fail(`GET /m/auction/${projectId}`, `status ${detailRes.status}`);

    const { res, json } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userCookies),
      },
      body: JSON.stringify({ amount: 8200 }),
    });
    // LIVE → 200, ENDED → 400/409, both are valid API responses
    if (res.status === 200) ok(`POST bid on ${projectId} → success`);
    else if (res.status >= 400 && res.status < 500) ok(`POST bid on ${projectId} → expected client error (${res.status}: ${json?.error ?? json?.message ?? ""})`);
    else fail(`POST bid on ${projectId}`, `status ${res.status}`);
  } else {
    fail("auction project discovery", "no project link on /m/auction");
  }

  // --- Drying reserve ---
  const dryingPage = await fetch(`${BASE}/m/drying`);
  const dryingHtml = await dryingPage.text();
  const listingMatch = dryingHtml.match(/\/m\/drying\/(c[a-z0-9]{20,})/i);
  const listingId = listingMatch?.[1];

  if (listingId) {
    const detailRes = await fetch(`${BASE}/m/drying/${listingId}`);
    if (detailRes.status === 200) ok(`GET /m/drying/${listingId}`);
    else fail(`GET /m/drying/${listingId}`, `status ${detailRes.status}`);

    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { res, json } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userCookies),
      },
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    if (res.status === 200 || res.status === 201) ok("POST /api/m/drying/reserve");
    else if (res.status === 409) ok("POST /api/m/drying/reserve → 409 duplicate (acceptable)");
    else fail("POST /api/m/drying/reserve", `${res.status} ${JSON.stringify(json)}`);
  } else {
    fail("drying listing discovery", "no listing link on /m/drying");
  }

  // --- Mock payment without purpose ---
  {
    const { res } = await fetchJson("/api/m/payments/mock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userCookies),
      },
      body: JSON.stringify({}),
    });
    if (res.status >= 400 && res.status < 500) ok("POST /api/m/payments/mock invalid body → rejected");
    else fail("POST /api/m/payments/mock invalid body", `status ${res.status}`);
  }

  // --- Upload without multipart ---
  {
    const { res } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { Cookie: cookieHeader(adminCookies) },
      body: JSON.stringify({}),
    });
    if (res.status === 400) ok("POST /api/upload non-multipart → 400");
    else fail("POST /api/upload non-multipart", `status ${res.status}`);
  }

  // --- Register duplicate phone ---
  {
    const { res } = await fetchJson("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    if (res.status >= 400) ok("POST /api/auth/register duplicate → rejected");
    else fail("POST /api/auth/register duplicate", `status ${res.status}`);
  }

  // --- Invalid login ---
  {
    const { res } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    if (res.status === 401) ok("POST /api/auth/login wrong password → 401");
    else fail("POST /api/auth/login wrong password", `status ${res.status}`);
  }

  // --- Third-party SSO ---
  {
    const { json: tokenData } = await fetchJson("/api/dev/third-party-token?u_id=smoke_sso");
    if (tokenData?.token) {
      const res = await fetch(`${BASE}/m/sso?token=${encodeURIComponent(tokenData.token)}`, {
        redirect: "manual",
      });
      if (res.status === 307 || res.status === 308 || res.status === 200) ok("GET /m/sso with token");
      else fail("GET /m/sso", `status ${res.status}`);
    }
  }

  // --- Admin dict page (division) ---
  {
    const res = await fetch(`${BASE}/admin/dict`, {
      headers: { Cookie: cookieHeader(adminCookies) },
      redirect: "manual",
    });
    if (res.status === 200) ok("GET /admin/dict");
    else fail("GET /admin/dict", `status ${res.status}`);
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
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
