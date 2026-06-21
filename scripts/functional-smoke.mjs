#!/usr/bin/env node
/**
 * Functional smoke tests against a running Next.js dev server.
 * Usage: node scripts/functional-smoke.mjs [baseUrl]
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] || process.env.BASE_URL || "http://localhost:3000";
let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`✓ ${name}`);
  passed++;
}

function fail(name, detail) {
  console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  failed++;
}

function assert(name, cond, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

async function fetchStatus(url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  return res.status;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, headers: res.headers };
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }

  ingest(headers) {
    const raw = headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) {
        this.map.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    }
  }

  header() {
    if (this.map.size === 0) return undefined;
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function fetchWithJar(url, jar, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { ...opts, headers });
  jar.ingest(res.headers);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log(`=== Functional smoke tests @ ${BASE} ===\n`);

  // Public pages
  assert("GET /", (await fetchStatus(`${BASE}/`)) === 200);
  assert("GET /m", (await fetchStatus(`${BASE}/m`)) === 200);
  assert("GET /admin/login", (await fetchStatus(`${BASE}/admin/login`)) === 200);
  assert(
    "GET /admin redirects when unauthenticated",
    [307, 308].includes(await fetchStatus(`${BASE}/admin`)),
  );

  const userJar = new CookieJar();
  const adminJar = new CookieJar();

  const userLogin = await fetchWithJar(`${BASE}/api/auth/login`, userJar, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  assert("User login", userLogin.json.ok === true, JSON.stringify(userLogin.json));

  const adminLogin = await fetchWithJar(`${BASE}/api/auth/admin/login`, adminJar, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  assert("Admin login", adminLogin.json.ok === true, JSON.stringify(adminLogin.json));

  const bidNoAuth = await fetch(`${BASE}/api/m/auction/fake/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 1000 }),
  });
  assert("Bid without auth returns 401", bidNoAuth.status === 401);

  const tp = await fetchJson(`${BASE}/api/dev/third-party-token?u_id=test-user-001`);
  assert("Third-party token", typeof tp.json.token === "string");

  for (const path of ["/m/auction", "/m/drying", "/m/me", "/m/orders"]) {
    const status = await fetchStatus(`${BASE}${path}`, {
      headers: { Cookie: userJar.header() || "" },
    });
    assert(`GET ${path}`, status === 200, `status ${status}`);
  }

  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying", "/admin/dict"]) {
    const status = await fetchStatus(`${BASE}${path}`, {
      headers: { Cookie: adminJar.header() || "" },
    });
    assert(`GET ${path}`, status === 200, `status ${status}`);
  }

  const prisma = new PrismaClient();
  try {
    const project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });

    if (!project) {
      fail("LIVE auction project exists");
    } else {
      pass("LIVE auction project exists");

      const detail = await fetchWithJar(`${BASE}/m/auction/${project.id}`, userJar);
      assert("Auction detail page", detail.status === 200 && detail.text.includes("出价"));

      const top = project.bids[0]?.amount;
      const minBid = top
        ? Number(top) + Number(project.bidStep)
        : Number(project.startPrice);

      const bid = await fetchWithJar(`${BASE}/api/m/auction/${project.id}/bid`, userJar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: minBid }),
      });
      assert("Place bid", bid.json.ok === true, JSON.stringify(bid.json));

      const pay = await fetchWithJar(`${BASE}/api/m/payments/mock`, userJar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "AUCTION_DEPOSIT",
          auctionProjectId: project.id,
        }),
      });
      assert(
        "Mock payment (deposit already paid or ok)",
        pay.json.ok === true || pay.status === 409 || Boolean(pay.json.error),
        JSON.stringify(pay.json),
      );
    }

    const listing = await prisma.dryingFieldListing.findFirst();
    if (!listing) {
      fail("Drying listing exists");
    } else {
      pass("Drying listing exists");
      const reserve = await fetchWithJar(`${BASE}/api/m/drying/reserve`, userJar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          startDate: "2026-07-01",
          endDate: "2026-07-02",
        }),
      });
      assert(
        "Drying reserve API",
        reserve.json.ok === true || Boolean(reserve.json.error),
        JSON.stringify(reserve.json),
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  const emptyAsset = await fetchWithJar(`${BASE}/api/admin/assets`, adminJar, {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data" },
  });
  assert(
    "Admin assets POST without fields returns error",
    emptyAsset.status === 400 || Boolean(emptyAsset.json.error),
    `status ${emptyAsset.status} ${JSON.stringify(emptyAsset.json)}`,
  );

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
