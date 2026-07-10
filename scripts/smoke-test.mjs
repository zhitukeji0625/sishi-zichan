#!/usr/bin/env node
/**
 * API smoke tests against `npm start` (production mode).
 * Usage: npm run smoke
 * Optional env: SMOKE_BASE_URL, SMOKE_AUCTION_ID, SMOKE_LISTING_ID
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const isProd = process.env.NODE_ENV === "production";

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function extractCookie(setCookies, name) {
  const list = Array.isArray(setCookies) ? setCookies : [];
  for (const c of list) {
    if (c.startsWith(name + "=")) return c.split(";")[0];
  }
  return "";
}

async function jsonFetch(path, { method = "GET", body, cookie, contentType } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) {
    headers["Content-Type"] = contentType ?? "application/json";
  }
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return { res, json, setCookie };
}

async function getIdsFromDb() {
  if (process.env.SMOKE_AUCTION_ID && process.env.SMOKE_LISTING_ID) {
    return { auctionId: process.env.SMOKE_AUCTION_ID, listingId: process.env.SMOKE_LISTING_ID };
  }
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const auction = await p.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
    const listing = await p.dryingFieldListing.findFirst();
    return { auctionId: auction?.id, listingId: listing?.id };
  } finally {
    await p.$disconnect();
  }
}

async function main() {
  console.log(`Smoke test → ${BASE}\n`);

  // 1. Home
  {
    const { res } = await jsonFetch("/");
    res.status === 200 ? pass("GET /") : fail("GET /", `status ${res.status}`);
  }

  // 2. User login
  let userCookie = "";
  {
    const { res, json, setCookie } = await jsonFetch("/api/auth/login", {
      method: "POST",
      body: { phone: "13800138000", password: "user123" },
    });
    userCookie = extractCookie(setCookie, "sishi_user_session");
    res.status === 200 && json.ok ? pass("POST user login") : fail("POST user login", `status ${res.status}`);
  }

  // 3. Admin login
  let adminCookie = "";
  {
    const { res, json, setCookie } = await jsonFetch("/api/auth/admin/login", {
      method: "POST",
      body: { phone: "13900000001", password: "admin123" },
    });
    adminCookie = extractCookie(setCookie, "sishi_admin_session");
    res.status === 200 && json.ok ? pass("POST admin login") : fail("POST admin login", `status ${res.status}`);
  }

  // 4. Unauthenticated bid → 401
  {
    const { res } = await jsonFetch("/api/m/auction/x/bid", { method: "POST", body: { amount: 1000 } });
    res.status === 401 ? pass("POST bid unauth → 401") : fail("POST bid unauth → 401", `status ${res.status}`);
  }

  // 5–7. Key pages
  for (const [name, path, cookie] of [
    ["GET /m/auction", "/m/auction", userCookie],
    ["GET /m/drying", "/m/drying", userCookie],
    ["GET /admin", "/admin", adminCookie],
  ]) {
    const { res } = await jsonFetch(path, { cookie });
    res.status === 200 ? pass(name) : fail(name, `status ${res.status}`);
  }

  // 8. Dev third-party token (404 in production is expected)
  {
    const { res } = await jsonFetch("/api/dev/third-party-token?u_id=test");
    if (isProd) {
      res.status === 404 ? pass("GET dev token → 404 (prod)") : fail("GET dev token → 404 (prod)", `status ${res.status}`);
    } else {
      res.status === 200 ? pass("GET dev token") : fail("GET dev token", `status ${res.status}`);
    }
  }

  // 9–10. Multipart Content-Type guard
  for (const [name, path] of [
    ["POST upload non-multipart → 400", "/api/upload"],
    ["POST admin/assets non-multipart → 400", "/api/admin/assets"],
  ]) {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "{}",
    });
    res.status === 400 ? pass(name) : fail(name, `status ${res.status}`);
  }

  const { auctionId, listingId } = await getIdsFromDb();
  if (!auctionId) fail("resolve auction id");
  if (!listingId) fail("resolve listing id");

  // 11. Bid on live auction
  let bidAmount = 8200;
  if (auctionId) {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    try {
      const project = await p.auctionProject.findUnique({ where: { id: auctionId } });
      const top = await p.auctionBid.findFirst({ where: { projectId: auctionId }, orderBy: { amount: "desc" } });
      if (project) {
        const start = Number(project.startPrice);
        const step = Number(project.bidStep);
        bidAmount = top ? Number(top.amount) + step : start;
      }
    } finally {
      await p.$disconnect();
    }
    const { res, json } = await jsonFetch(`/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      body: { amount: bidAmount },
      cookie: userCookie,
    });
    res.status === 200 && json.ok ? pass("POST bid", `amount ${bidAmount}`) : fail("POST bid", `${res.status} ${JSON.stringify(json)}`);
  }

  // 12. Mock deposit → 409 if already paid (expected for seeded user)
  if (auctionId) {
    const { res, json } = await jsonFetch("/api/m/payments/mock", {
      method: "POST",
      body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId },
      cookie: userCookie,
    });
    res.status === 409 ? pass("POST mock deposit → 409 already paid") : fail("POST mock deposit → 409", `${res.status} ${JSON.stringify(json)}`);
  }

  // 13–14. Drying reserve + duplicate (use dates unlikely to collide with prior runs)
  const dayOffset = 60 + (Date.now() % 30);
  const startD = new Date();
  startD.setUTCDate(startD.getUTCDate() + dayOffset);
  const endD = new Date(startD);
  endD.setUTCDate(endD.getUTCDate() + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const reserveDates = { startDate: fmt(startD), endDate: fmt(endD) };
  if (listingId) {
    const { res, json } = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      body: { listingId, ...reserveDates },
      cookie: userCookie,
    });
    res.status === 200 && json.ok ? pass("POST drying reserve") : fail("POST drying reserve", `${res.status} ${JSON.stringify(json)}`);

    const dup = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      body: { listingId, ...reserveDates },
      cookie: userCookie,
    });
    dup.res.status === 409 ? pass("POST drying reserve dup → 409") : fail("POST drying reserve dup → 409", `${dup.res.status} ${JSON.stringify(dup.json)}`);
  }

  // 15. User logout
  {
    const { res, json } = await jsonFetch("/api/auth/logout", { method: "POST", cookie: userCookie });
    res.status === 200 && json.ok ? pass("POST user logout") : fail("POST user logout", `status ${res.status}`);
  }

  // 16. Admin logout
  {
    const { res, json } = await jsonFetch("/api/auth/admin/logout", { method: "POST", cookie: adminCookie });
    res.status === 200 && json.ok ? pass("POST admin logout") : fail("POST admin logout", `status ${res.status}`);
  }

  // 17. Register validation
  {
    const { res } = await jsonFetch("/api/auth/register", { method: "POST", body: { phone: "", password: "" } });
    res.status === 400 ? pass("POST register invalid → 400") : fail("POST register invalid → 400", `status ${res.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
