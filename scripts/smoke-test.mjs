#!/usr/bin/env node
/**
 * API smoke tests — run after `npm run build && npm start`.
 * Optional env: SMOKE_AUCTION_ID, SMOKE_LISTING_ID
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function jar() {
  const cookies = {};
  return {
    set(res) {
      for (const c of res.headers.getSetCookie?.() || []) {
        const [kv] = c.split(";");
        const eq = kv.indexOf("=");
        cookies[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    },
    header() {
      return Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    },
  };
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, body, status: res.status };
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("✓", name);
  } catch (e) {
    failed++;
    console.log("✗", name, "-", e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const userJar = jar();
const adminJar = jar();

async function main() {
  await test("GET /", async () => {
    const { status } = await fetchJson("/");
    assert(status === 200, `status ${status}`);
  });

  await test("GET /m", async () => {
    const { status } = await fetchJson("/m");
    assert(status === 200, `status ${status}`);
  });

  await test("POST /api/auth/login (user)", async () => {
    const { res, body, status } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userJar.set(res);
    assert(status === 200, `status ${status}: ${JSON.stringify(body)}`);
  });

  await test("POST /api/auth/admin/login", async () => {
    const { res, body, status } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminJar.set(res);
    assert(status === 200, `status ${status}: ${JSON.stringify(body)}`);
  });

  await test("GET /admin (authenticated)", async () => {
    const { status } = await fetchJson("/admin", { headers: { Cookie: adminJar.header() } });
    assert(status === 200, `status ${status}`);
  });

  await test("GET /m/auction", async () => {
    const { status } = await fetchJson("/m/auction", { headers: { Cookie: userJar.header() } });
    assert(status === 200, `status ${status}`);
  });

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const auction =
    process.env.SMOKE_AUCTION_ID
      ? await prisma.auctionProject.findUnique({ where: { id: process.env.SMOKE_AUCTION_ID } })
      : await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  const listing =
    process.env.SMOKE_LISTING_ID
      ? await prisma.dryingFieldListing.findUnique({ where: { id: process.env.SMOKE_LISTING_ID } })
      : await prisma.dryingFieldListing.findFirst();
  await prisma.$disconnect();

  assert(auction, "no auction project in DB");
  assert(listing, "no drying listing in DB");

  await test("GET /m/auction/[id]", async () => {
    const { status } = await fetchJson(`/m/auction/${auction.id}`, {
      headers: { Cookie: userJar.header() },
    });
    assert(status === 200, `status ${status}`);
  });

  await test("POST bid on live auction", async () => {
    assert(auction.status === "LIVE", `auction status is ${auction.status}, run db:seed to renew`);
    const { PrismaClient: PC } = await import("@prisma/client");
    const p = new PC();
    const top = await p.auctionBid.findFirst({
      where: { projectId: auction.id },
      orderBy: { amount: "desc" },
    });
    await p.$disconnect();
    const step = Number(auction.bidStep ?? 200);
    const base = top ? Number(top.amount) : Number(auction.startPrice);
    const amount = base + step;
    const { body, status } = await fetchJson(`/api/m/auction/${auction.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userJar.header() },
      body: JSON.stringify({ amount }),
    });
    assert(status === 200, `status ${status}: ${JSON.stringify(body)}`);
  });

  await test("GET /m/drying", async () => {
    const { status } = await fetchJson("/m/drying", { headers: { Cookie: userJar.header() } });
    assert(status === 200, `status ${status}`);
  });

  const dayOffset = 10 + Math.floor(Math.random() * 20);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + dayOffset);
  const end = new Date(tomorrow);
  end.setDate(end.getDate() + 1);
  const startDate = tomorrow.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  await test("POST drying reserve", async () => {
    const { body, status } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userJar.header() },
      body: JSON.stringify({ listingId: listing.id, startDate, endDate }),
    });
    assert(status === 200, `status ${status}: ${JSON.stringify(body)}`);
  });

  await test("POST drying reserve duplicate -> 409", async () => {
    const { body, status } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userJar.header() },
      body: JSON.stringify({ listingId: listing.id, startDate, endDate }),
    });
    assert(status === 409, `status ${status}: ${JSON.stringify(body)}`);
  });

  await test("POST mock payment AUCTION_DEPOSIT", async () => {
    const { body, status } = await fetchJson("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userJar.header() },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: auction.id }),
    });
    assert([200, 409].includes(status), `status ${status}: ${JSON.stringify(body)}`);
  });

  await test("GET /api/dev/third-party-token", async () => {
    const { body, status } = await fetchJson("/api/dev/third-party-token?u_id=smoke-test");
    // Production server (npm start) disables this route; dev server returns 200.
    assert([200, 404].includes(status), `status ${status}: ${JSON.stringify(body)}`);
    if (status === 200) assert(body.token, "no token in response");
  });

  await test("POST /api/upload without multipart -> 400", async () => {
    const { status } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminJar.header() },
      body: "{}",
    });
    assert(status === 400, `expected 400 got ${status}`);
  });

  await test("POST /api/admin/assets without multipart -> 400", async () => {
    const { status } = await fetchJson("/api/admin/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminJar.header() },
      body: JSON.stringify({ name: "test" }),
    });
    assert(status === 400, `expected 400 got ${status}`);
  });

  await test("POST /api/auth/logout (user)", async () => {
    const { status } = await fetchJson("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: userJar.header() },
    });
    assert(status === 200, `status ${status}`);
  });

  console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
