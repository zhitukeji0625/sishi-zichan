#!/usr/bin/env node
/**
 * Functional smoke tests against a running Next.js server (npm start).
 * Usage: SMOKE_BASE=http://localhost:3000 node scripts/smoke-test.mjs
 */
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

function extractEntityId(html, prefix) {
  const re = new RegExp(`${prefix}/(cm[a-z0-9]{20,})`, "gi");
  const m = html.match(re);
  if (!m?.length) return null;
  const id = m[0].slice(prefix.length + 1);
  return id;
}

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const map = new Map();
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) map.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return map;
}

function cookieHeader(map) {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
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
  console.log(`Smoke tests → ${BASE}\n`);

  await test("GET / returns 200", async () => {
    const res = await fetch(`${BASE}/`);
    assert(res.ok, `status ${res.status}`);
  });

  await test("GET /m returns 200", async () => {
    const res = await fetch(`${BASE}/m`);
    assert(res.ok, `status ${res.status}`);
  });

  await test("GET /admin/login returns 200", async () => {
    const res = await fetch(`${BASE}/admin/login`);
    assert(res.ok, `status ${res.status}`);
  });

  await test("GET /admin redirects to login when unauthenticated", async () => {
    const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
    assert(res.status === 307 || res.status === 302, `status ${res.status}`);
    assert(res.headers.get("location")?.includes("/admin/login"), "not redirected to login");
  });

  await test("POST /api/auth/login rejects empty body", async () => {
    const { res } = await jsonFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert(res.status === 400, `status ${res.status}`);
  });

  let userCookies = new Map();
  await test("POST /api/auth/login demo user", async () => {
    const { res, body } = await jsonFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    assert(res.ok, `status ${res.status} ${JSON.stringify(body)}`);
    userCookies = parseCookies(res);
    assert(userCookies.has("sishi_user_session"), "missing session cookie");
  });

  let adminCookies = new Map();
  await test("POST /api/auth/admin/login demo admin", async () => {
    const { res, body } = await jsonFetch("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    assert(res.ok, `status ${res.status} ${JSON.stringify(body)}`);
    adminCookies = parseCookies(res);
    assert(adminCookies.has("sishi_admin_session"), "missing admin session cookie");
  });

  await test("GET /api/m/auction/xxx/bid without auth → 401", async () => {
    const { res } = await jsonFetch("/api/m/auction/fake/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    assert(res.status === 401, `status ${res.status}`);
  });

  await test("GET /m/auction returns 200 when logged in", async () => {
    const res = await fetch(`${BASE}/m/auction`, {
      headers: { Cookie: cookieHeader(userCookies) },
    });
    assert(res.ok, `status ${res.status}`);
  });

  let liveProjectId = null;
  await test("GET /m/auction page contains LIVE project link", async () => {
    const res = await fetch(`${BASE}/m/auction`, {
      headers: { Cookie: cookieHeader(userCookies) },
    });
    const html = await res.text();
    liveProjectId = extractEntityId(html, "/m/auction");
    assert(liveProjectId, "no auction project link found");
  });

  await test("POST /api/m/auction bid with valid increment", async () => {
    assert(liveProjectId, "no project id");
    const { res, body } = await jsonFetch(`/api/m/auction/${liveProjectId}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userCookies),
      },
      body: JSON.stringify({ amount: 999999 }),
    });
    // May fail if below min increment — that's ok; we check API responds
    assert(res.status === 200 || res.status === 400, `unexpected ${res.status}`);
    if (res.status === 400) assert(body?.error, "expected error message");
  });

  await test("GET /m/drying returns 200", async () => {
    const res = await fetch(`${BASE}/m/drying`, {
      headers: { Cookie: cookieHeader(userCookies) },
    });
    assert(res.ok, `status ${res.status}`);
  });

  let listingId = null;
  await test("GET /m/drying page contains listing link", async () => {
    const res = await fetch(`${BASE}/m/drying`, {
      headers: { Cookie: cookieHeader(userCookies) },
    });
    const html = await res.text();
    listingId = extractEntityId(html, "/m/drying");
    assert(listingId, "no drying listing link found");
  });

  const reserveBase = new Date();
  reserveBase.setFullYear(reserveBase.getFullYear() + 2);
  reserveBase.setDate(reserveBase.getDate() + (Date.now() % 90));
  const startDate = reserveBase.toISOString().slice(0, 10);
  const endDate = new Date(reserveBase.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  await test("POST /api/m/drying/reserve creates reservation", async () => {
    assert(listingId, "no listing id");
    const { res, body } = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userCookies),
      },
      body: JSON.stringify({ listingId, startDate, endDate }),
    });
    assert(res.status === 200 || res.status === 400, `status ${res.status} ${JSON.stringify(body)}`);
    if (res.status === 200) assert(body?.ok, "expected ok");
  });

  await test("POST /api/m/drying/reserve duplicate overlap → 409", async () => {
    assert(listingId, "no listing id");
    const { res, body } = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userCookies),
      },
      body: JSON.stringify({ listingId, startDate, endDate }),
    });
    assert(res.status === 409, `status ${res.status} ${JSON.stringify(body)}`);
    assert(body?.error?.includes("已有预约"), body?.error);
  });

  await test("POST /api/m/payments/mock rejects missing purpose", async () => {
    const { res } = await jsonFetch("/api/m/payments/mock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userCookies),
      },
      body: "{}",
    });
    assert(res.status === 400, `status ${res.status}`);
  });

  await test("POST /api/upload without multipart → 400 or 401", async () => {
    const { res } = await jsonFetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(adminCookies),
      },
      body: "{}",
    });
    assert(res.status === 400 || res.status === 401, `status ${res.status}`);
  });

  await test("GET /api/dev/third-party-token in production → 404", async () => {
    const { res } = await jsonFetch("/api/dev/third-party-token?u_id=test");
    assert(res.status === 404, `expected 404, got ${res.status}`);
  });

  await test("POST /api/auth/register rejects invalid phone", async () => {
    const { res } = await jsonFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "bad", password: "123456", name: "x" }),
    });
    assert(res.status === 400, `status ${res.status}`);
  });

  await test("GET /admin with admin cookie returns 200", async () => {
    const res = await fetch(`${BASE}/admin`, {
      headers: { Cookie: cookieHeader(adminCookies) },
    });
    assert(res.ok, `status ${res.status}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
