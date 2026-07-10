#!/usr/bin/env node
/**
 * API smoke tests — run after `npm run build && npm start`.
 * Optional env: SMOKE_AUCTION_ID, SMOKE_LISTING_ID, SMOKE_BASE (default http://localhost:3000)
 */
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const TMP = mkdtempSync(join(tmpdir(), "sishi-smoke-"));

let pass = 0;
let fail = 0;

function check(name, got, want) {
  if (got === want) {
    console.log(`✓ ${name} (${got})`);
    pass++;
  } else {
    console.error(`✗ ${name} (got ${got}, want ${want})`);
    fail++;
  }
}

async function req(method, path, { cookie, body, headers } = {}) {
  const opts = { method, headers: { ...headers } };
  if (cookie) opts.headers.Cookie = cookie;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

function parseCookies(setCookieHeaders) {
  const parts = [];
  for (const h of setCookieHeaders) {
    const m = h.match(/^([^=]+)=([^;]+)/);
    if (m) parts.push(`${m[1]}=${m[2]}`);
  }
  return parts.join("; ");
}

async function loginUser() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, cookie: parseCookies(cookies) };
}

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, cookie: parseCookies(cookies) };
}

async function getIds() {
  if (process.env.SMOKE_AUCTION_ID && process.env.SMOKE_LISTING_ID) {
    return {
      auctionId: process.env.SMOKE_AUCTION_ID,
      listingId: process.env.SMOKE_LISTING_ID,
    };
  }
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const [proj, listing] = await Promise.all([
      p.auctionProject.findFirst({
        where: { status: "LIVE" },
        select: { id: true },
      }),
      p.dryingFieldListing.findFirst({
        where: { status: "OPERATING" },
        select: { id: true },
      }),
    ]);
    return { auctionId: proj?.id, listingId: listing?.id };
  } finally {
    await p.$disconnect();
  }
}

function futureDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) + "T00:00:00.000Z";
}

async function main() {
  console.log(`Smoke tests → ${BASE}\n`);

  // Static pages
  for (const [name, path] of [
    ["GET /", "/"],
    ["GET /admin/login", "/admin/login"],
    ["GET /m/login", "/m/login"],
    ["GET /m/auction", "/m/auction"],
    ["GET /m/drying", "/m/drying"],
  ]) {
    const res = await fetch(`${BASE}${path}`);
    check(name, res.status, 200);
  }

  // Auth
  const userLogin = await loginUser();
  check("POST /api/auth/login", userLogin.status, 200);

  const adminLogin = await loginAdmin();
  check("POST /api/auth/admin/login", adminLogin.status, 200);

  const unauthBid = await req("POST", "/api/m/auction/fake/bid", { body: { amount: 8000 } });
  check("POST bid without auth", unauthBid.status, 401);

  const adminDash = await req("GET", "/admin", { cookie: adminLogin.cookie });
  check("GET /admin (authed)", adminDash.status, 200);

  // Dev token — 404 in production is expected
  const devToken = await req("GET", "/api/dev/third-party-token");
  const devOk = devToken.status === 200 || devToken.status === 404;
  if (devOk) {
    console.log(`✓ GET /api/dev/third-party-token (${devToken.status})`);
    pass++;
  } else {
    console.error(`✗ GET /api/dev/third-party-token (got ${devToken.status})`);
    fail++;
  }

  // Multipart guards
  const uploadBad = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: adminLogin.cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  check("POST /api/upload no multipart", uploadBad.status, 400);

  const assetBad = await fetch(`${BASE}/api/admin/assets`, {
    method: "POST",
    headers: { Cookie: adminLogin.cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  check("POST /api/admin/assets no multipart", assetBad.status, 400);

  const { auctionId, listingId } = await getIds();

  if (auctionId) {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    let minBid = 8000;
    try {
      const proj = await p.auctionProject.findUnique({
        where: { id: auctionId },
        include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
      });
      if (proj) {
        const highest = proj.bids[0]?.amount ? Number(proj.bids[0].amount) : null;
        const start = Number(proj.startPrice);
        const step = Number(proj.bidStep);
        minBid = highest != null ? highest + step : start;
      }
    } finally {
      await p.$disconnect();
    }

    const bid = await req("POST", `/api/m/auction/${auctionId}/bid`, {
      cookie: userLogin.cookie,
      body: { amount: minBid },
    });
    check("POST live auction bid", bid.status, 200);
  } else {
    console.error("✗ No LIVE auction project found");
    fail++;
  }

  if (listingId) {
    // Use distant dates to avoid collisions from prior smoke runs
    const start = futureDate(20);
    const end = futureDate(21);
    const reserve = await req("POST", "/api/m/drying/reserve", {
      cookie: userLogin.cookie,
      body: { listingId, startDate: start, endDate: end },
    });
    check("POST drying reserve", reserve.status, 200);

    const dup = await req("POST", "/api/m/drying/reserve", {
      cookie: userLogin.cookie,
      body: { listingId, startDate: start, endDate: end },
    });
    check("POST duplicate drying reserve", dup.status, 409);
  } else {
    console.error("✗ No OPERATING drying listing found");
    fail += 2;
  }

  // Mock payment — deposit already paid for demo user, expect 409
  if (auctionId) {
    const pay = await req("POST", "/api/m/payments/mock", {
      cookie: userLogin.cookie,
      body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId },
    });
    check("POST duplicate auction deposit", pay.status, 409);
  }

  // Logout
  const logout = await req("POST", "/api/auth/logout", { cookie: userLogin.cookie });
  check("POST /api/auth/logout", logout.status, 200);

  console.log(`\n---\nPass: ${pass}, Fail: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
