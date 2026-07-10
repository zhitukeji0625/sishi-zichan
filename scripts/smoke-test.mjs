#!/usr/bin/env node
/**
 * API smoke test — run after `npm run build && npm start`.
 * Env: BASE_URL (default http://localhost:3000)
 *      SMOKE_AUCTION_ID, SMOKE_LISTING_ID (optional, auto-detected via login+bid probe)
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  errors.push({ name, detail });
  console.log(`  ✗ ${name}: ${detail}`);
}

function extractId(html, prefix) {
  const re = new RegExp(`${prefix}/(cm[a-z0-9]+)`, "gi");
  let m;
  while ((m = re.exec(html))) return m[1];
  return "";
}

async function placeBid(auctionId, userJar) {
  let amount = 1;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { res, json } = await fetchJson(`/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userJar.header(),
      },
      body: JSON.stringify({ amount }),
    });
    if (res.status === 200 && json?.ok) return { ok: true, amount };
    const m = json?.error?.match(/不低于\s*([\d.]+)/);
    if (m) amount = parseFloat(m[1]);
    else return { ok: false, detail: `${res.status} ${JSON.stringify(json)}` };
  }
  return { ok: false, detail: "max retries exceeded" };
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  return { res, json, text };
}

function cookieJar() {
  const cookies = new Map();
  return {
    store(res) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header() {
      if (!cookies.size) return "";
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // --- Public pages ---
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 200) ok(`GET ${path}`);
    else fail(`GET ${path}`, `status ${res.status}`);
  }

  // --- Auth ---
  const userJar = cookieJar();
  {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userJar.store(res);
    if (res.status === 200 && json?.ok) ok("User login");
    else fail("User login", `${res.status} ${JSON.stringify(json)}`);
  }

  const adminJar = cookieJar();
  {
    const { res, json } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminJar.store(res);
    if (res.status === 200 && json?.ok) ok("Admin login");
    else fail("Admin login", `${res.status} ${JSON.stringify(json)}`);
  }

  // --- Unauthenticated bid ---
  {
    const { res, json } = await fetchJson("/api/m/auction/fake/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    if (res.status === 401) ok("Bid without login -> 401");
    else fail("Bid without login", `expected 401, got ${res.status}`);
  }

  // --- Discover auction id from page or env ---
  let auctionId = process.env.SMOKE_AUCTION_ID ?? "";
  if (!auctionId) {
    const page = await fetch(`${BASE}/m/auction`);
    const html = await page.text();
    auctionId = extractId(html, "/m/auction");
  }

  // --- Bid on live auction ---
  if (auctionId) {
    const bid = await placeBid(auctionId, userJar);
    if (bid.ok) ok(`Bid ${bid.amount} on auction ${auctionId}`);
    else fail("Bid on auction", bid.detail);
  } else {
    fail("Bid on auction", "no auction id found");
  }

  // --- Drying reserve ---
  let listingId = process.env.SMOKE_LISTING_ID ?? "";
  if (!listingId) {
    const page = await fetch(`${BASE}/m/drying`);
    const html = await page.text();
    listingId = extractId(html, "/m/drying");
  }
  if (listingId) {
    const start = new Date();
    start.setDate(start.getDate() + 10);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const { res, json } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userJar.header(),
      },
      body: JSON.stringify({
        listingId,
        startDate: fmt(start),
        endDate: fmt(end),
      }),
    });
    if (res.status === 200 && json?.ok) ok(`Drying reserve ${fmt(start)}`);
    else if (res.status === 400 && json?.error?.includes("已有预约")) ok("Drying reserve overlap -> 400 (expected)");
    else fail("Drying reserve", `${res.status} ${JSON.stringify(json)}`);
  } else {
    fail("Drying reserve", "no listing id found");
  }

  // --- Mock payment deposit (already paid -> 409) ---
  if (auctionId) {
    const { res, json } = await fetchJson("/api/m/payments/mock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userJar.header(),
      },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId }),
    });
    if (res.status === 409) ok("Auction deposit already paid -> 409");
    else fail("Auction deposit", `expected 409, got ${res.status} ${JSON.stringify(json)}`);
  }

  // --- Multipart guards ---
  for (const [name, path, jar] of [
    ["Upload non-multipart", "/api/upload", adminJar],
    ["Admin assets non-multipart", "/api/admin/assets", adminJar],
  ]) {
    const { res, json } = await fetchJson(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: jar.header() },
      body: JSON.stringify({ name: "x" }),
    });
    if (res.status === 400 && json?.error) ok(`${name} -> 400`);
    else fail(name, `expected 400, got ${res.status} body=${JSON.stringify(json)}`);
  }

  // --- Register duplicate ---
  {
    const { res, json } = await fetchJson("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    if (res.status === 409) ok("Register duplicate -> 409");
    else fail("Register duplicate", `expected 409, got ${res.status}`);
  }

  // --- Invalid login ---
  {
    const { res } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    if (res.status === 401) ok("Invalid login -> 401");
    else fail("Invalid login", `expected 401, got ${res.status}`);
  }

  // --- Third-party token (404 in production) ---
  {
    const { res } = await fetchJson("/api/dev/third-party-token?u_id=test");
    if (res.status === 404) ok("Third-party token disabled in prod -> 404");
    else if (res.status === 200) ok("Third-party token (dev mode)");
    else fail("Third-party token", `unexpected ${res.status}`);
  }

  // --- Logout ---
  for (const [name, path, jar] of [
    ["User logout", "/api/auth/logout", userJar],
    ["Admin logout", "/api/auth/admin/logout", adminJar],
  ]) {
    const { res, json } = await fetchJson(path, {
      method: "POST",
      headers: { Cookie: jar.header() },
    });
    if (res.status === 200 && json?.ok) ok(name);
    else fail(name, `${res.status} ${JSON.stringify(json)}`);
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.error("\nFailures:");
    for (const e of errors) console.error(`  - ${e.name}: ${e.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
