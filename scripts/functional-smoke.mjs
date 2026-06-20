#!/usr/bin/env node
/**
 * 功能冒烟测试：需 dev server 运行中（npm run dev）
 * 用法：BASE_URL=http://localhost:3000 node scripts/functional-smoke.mjs
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
let passed = 0;
let failed = 0;
const errors = [];

function jar() {
  const cookies = new Map();
  return {
    setFrom(res) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const c of raw) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        if (eq === -1) continue;
        cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`${name}: ${msg}`);
    console.log(`✗ ${name}: ${msg}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** 匹配 cuid 风格 ID，避免误匹配 /m/drying/page 等路径 */
const CUID_RE = /\/m\/(?:auction|drying)\/(c[a-z0-9]{20,})/gi;

function extractIds(html, kind) {
  const re = new RegExp(`/m/${kind}/(c[a-z0-9]{20,})`, "gi");
  const ids = new Set();
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

// --- Public pages ---
const publicPages = ["/", "/m", "/m/login", "/m/register", "/m/auction", "/m/drying", "/admin/login"];
for (const p of publicPages) {
  await test(`GET ${p} → 200`, async () => {
    const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
    assert(r.status === 200, `got ${r.status}`);
  });
}

// --- Admin auth ---
const adminJar = jar();
await test("Admin login", async () => {
  const r = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  assert(r.ok, `status ${r.status}: ${await r.text()}`);
  adminJar.setFrom(r);
});

const adminPages = [
  "/admin",
  "/admin/assets",
  "/admin/auctions",
  "/admin/drying",
  "/admin/registrations",
  "/admin/organizations",
  "/admin/admins",
  "/admin/announcements",
  "/admin/audit",
  "/admin/config",
  "/admin/dict",
];
for (const p of adminPages) {
  await test(`GET ${p} (admin) → 200`, async () => {
    const r = await fetch(`${BASE}${p}`, {
      headers: { Cookie: adminJar.header() },
      redirect: "manual",
    });
    assert(r.status === 200, `got ${r.status}`);
  });
}

// --- User auth ---
const userJar = jar();
await test("User login", async () => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  assert(r.ok, `status ${r.status}: ${await r.text()}`);
  userJar.setFrom(r);
});

const userPages = ["/m/me", "/m/orders"];
for (const p of userPages) {
  await test(`GET ${p} (user) → 200`, async () => {
    const r = await fetch(`${BASE}${p}`, {
      headers: { Cookie: userJar.header() },
      redirect: "manual",
    });
    assert(r.status === 200, `got ${r.status}`);
  });
}

// --- Third party token ---
await test("GET /api/dev/third-party-token", async () => {
  const r = await fetch(`${BASE}/api/dev/third-party-token?u_id=test123`);
  assert(r.ok, `status ${r.status}`);
  const j = await r.json();
  assert(j.token, "missing token");
});

// --- Auction bid flow ---
let projectId = null;
await test("Find LIVE auction project", async () => {
  const r = await fetch(`${BASE}/m/auction`, { headers: { Cookie: userJar.header() } });
  const html = await r.text();
  const ids = extractIds(html, "auction");
  assert(ids.length > 0, "no auction link found in /m/auction");
  projectId = ids[0];
});

let bidAmount = null;
await test("GET auction detail page", async () => {
  const r = await fetch(`${BASE}/m/auction/${projectId}`, {
    headers: { Cookie: userJar.header() },
  });
  assert(r.status === 200, `got ${r.status}`);
  const html = await r.text();
  const minMatch = html.match(/最低\s*¥(?:<!--\s*-->)?([\d.]+)/);
  if (minMatch) {
    bidAmount = parseFloat(minMatch[1]);
  } else {
    const topMatch = html.match(/当前最高出价[\s\S]*?¥(?:<!--\s*-->)?([\d.]+)/);
    const startMatch = html.match(/起拍价[\s\S]*?¥(?:<!--\s*-->)?([\d.]+)/);
    const stepMatch = html.match(/加价幅度[\s\S]*?¥(?:<!--\s*-->)?([\d.]+)/);
    const top = topMatch ? parseFloat(topMatch[1]) : null;
    const start = startMatch ? parseFloat(startMatch[1]) : null;
    const step = stepMatch ? parseFloat(stepMatch[1]) : 200;
    bidAmount = top != null ? top + step : start ?? 8000;
  }
  assert(Number.isFinite(bidAmount), "invalid min bid");
});

await test("POST bid", async () => {
  const r = await fetch(`${BASE}/api/m/auction/${projectId}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userJar.header() },
    body: JSON.stringify({ amount: bidAmount }),
  });
  const text = await r.text();
  assert(r.ok, `status ${r.status}: ${text}`);
  const j = JSON.parse(text);
  assert(j.ok === true, JSON.stringify(j));
});

// --- Drying reserve ---
let listingId = null;
await test("Find drying listing", async () => {
  const r = await fetch(`${BASE}/m/drying`, { headers: { Cookie: userJar.header() } });
  const html = await r.text();
  const ids = extractIds(html, "drying");
  assert(ids.length > 0, "no drying listing found");
  listingId = ids[0];
});

await test("POST drying reserve", async () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const r = await fetch(`${BASE}/api/m/drying/reserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userJar.header() },
    body: JSON.stringify({ listingId, startDate: fmt(start), endDate: fmt(end) }),
  });
  const text = await r.text();
  assert(r.ok || r.status === 409, `status ${r.status}: ${text}`);
});

// --- Mock payment (deposit already paid → 409 is ok) ---
await test("POST mock payment (auction deposit)", async () => {
  const r = await fetch(`${BASE}/api/m/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userJar.header() },
    body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId }),
  });
  const text = await r.text();
  assert(r.ok || r.status === 409, `status ${r.status}: ${text}`);
});

// --- Upload without multipart ---
await test("POST /api/upload without multipart → 400", async () => {
  const r = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminJar.header() },
    body: JSON.stringify({}),
  });
  assert(r.status === 400, `got ${r.status}`);
});

// --- Protected routes without auth ---
await test("GET /admin without auth → redirect", async () => {
  const r = await fetch(`${BASE}/admin`, { redirect: "manual" });
  assert(r.status === 307 || r.status === 302, `got ${r.status}`);
});

// --- Dict labels visible (not raw enum) ---
await test("Admin assets page shows Chinese labels", async () => {
  const r = await fetch(`${BASE}/admin/assets`, {
    headers: { Cookie: adminJar.header() },
  });
  const html = await r.text();
  assert(html.includes("闲置土地") || html.includes("闲置"), "expected Chinese asset type label");
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (errors.length) {
  console.log("\nFailures:");
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
