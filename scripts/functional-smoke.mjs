#!/usr/bin/env node
/**
 * Functional smoke tests against a running dev server (default http://localhost:3000).
 * Usage: npm run dev &  &&  npm run test:functional
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

function extractEntityId(html, prefix) {
  const re = new RegExp(`/${prefix}/(c[a-z0-9]{20,})`, "gi");
  const m = re.exec(html);
  return m ? m[1] : "";
}

function extractCookie(res, name) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  const single = res.headers.get("set-cookie");
  if (single) {
    const m = single.match(new RegExp(`${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json */
  }
  return { res, json, text };
}

async function main() {
  console.log(`Functional smoke tests → ${BASE}\n`);

  await test("GET / returns 200", async () => {
    const res = await fetch(BASE);
    assert(res.ok, `status ${res.status}`);
  });

  await test("GET /favicon.ico or /icon returns 200", async () => {
    let res = await fetch(`${BASE}/favicon.ico`);
    if (!res.ok) res = await fetch(`${BASE}/icon`);
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

  await test("POST /api/auth/login rejects bad creds", async () => {
    const { res } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "000", password: "bad" }),
    });
    assert(res.status === 401, `expected 401 got ${res.status}`);
  });

  let userCookie = "";
  await test("POST /api/auth/login demo user", async () => {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    assert(res.ok, `status ${res.status}`);
    assert(json?.ok, "expected ok:true");
    userCookie = extractCookie(res, "sishi_user_session") || "";
    assert(userCookie, "missing user session cookie");
  });

  let adminCookie = "";
  await test("POST /api/auth/admin/login demo admin", async () => {
    const { res, json } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    assert(res.ok, `status ${res.status}`);
    assert(json?.ok, "expected ok:true");
    adminCookie = extractCookie(res, "sishi_admin_session") || "";
    assert(adminCookie, "missing admin session cookie");
  });

  await test("GET /api/m/auction/x/bid without auth → 401", async () => {
    const { res } = await fetchJson("/api/m/auction/fake/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    assert(res.status === 401, `expected 401 got ${res.status}`);
  });

  await test("POST /api/upload without multipart → 400", async () => {
    const { res } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    assert(res.status === 400, `expected 400 got ${res.status}`);
  });

  await test("POST /api/admin/assets without multipart → 400", async () => {
    const { res } = await fetchJson("/api/admin/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ name: "x" }),
    });
    assert(res.status === 400, `expected 400 got ${res.status}`);
  });

  let projectId = "";
  await test("GET /m/auction lists LIVE project", async () => {
    const res = await fetch(`${BASE}/m/auction`, { headers: { Cookie: userCookie } });
    assert(res.ok, `status ${res.status}`);
    const html = await res.text();
    projectId = extractEntityId(html, "m/auction");
    assert(projectId, "no auction project link found in /m/auction");
  });

  await test("POST bid on LIVE auction", async () => {
    assert(projectId, "no projectId");
    const { res, json } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: 99999 }),
    });
    assert(res.ok, `status ${res.status} ${JSON.stringify(json)}`);
    assert(json?.ok && json?.bidId, "expected ok + bidId");
  });

  let listingId = "";
  await test("GET /m/drying lists operating listing", async () => {
    const res = await fetch(`${BASE}/m/drying`, { headers: { Cookie: userCookie } });
    assert(res.ok, `status ${res.status}`);
    const html = await res.text();
    listingId = extractEntityId(html, "m/drying");
    assert(listingId, "no drying listing link found");
  });

  await test("POST /api/m/drying/reserve", async () => {
    assert(listingId, "no listingId");
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const { res, json } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    assert(res.ok, `status ${res.status} ${JSON.stringify(json)}`);
    assert(json?.ok, "expected ok:true");
  });

  await test("GET /api/dev/third-party-token", async () => {
    const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=smoke_test");
    assert(res.ok, `status ${res.status}`);
    assert(json?.token, "expected token");
  });

  await test("POST /api/auth/third-party SSO", async () => {
    const { json: tok } = await fetchJson("/api/dev/third-party-token?u_id=smoke_sso");
    const { res, json } = await fetchJson("/api/auth/third-party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tok.token }),
    });
    assert(res.ok, `status ${res.status}`);
    assert(json?.ok, "expected ok:true");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
