#!/usr/bin/env node
/**
 * API smoke tests — run against `npm start` (production mode).
 * Usage: BASE=http://localhost:3000 node scripts/smoke.mjs
 */
const BASE = process.env.BASE || "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function req(method, path, { body, cookie, headers, redirect } = {}) {
  const opts = { method, headers: { ...headers }, redirect: redirect ?? "follow" };
  if (cookie) opts.headers.Cookie = cookie;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html or plain */
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, json, text, setCookie };
}

function extractCookie(setCookies, name) {
  for (const c of setCookies) {
    if (c.startsWith(`${name}=`)) return c.split(";")[0];
  }
  return null;
}

async function main() {
  console.log(`Smoke tests @ ${BASE}\n`);

  // --- Public pages ---
  let r = await req("GET", "/");
  assert("GET / → 200", r.status === 200);

  r = await req("GET", "/m");
  assert("GET /m → 200", r.status === 200);

  r = await req("GET", "/admin/login");
  assert("GET /admin/login → 200", r.status === 200);

  // --- Auth guards ---
  r = await req("GET", "/admin", { redirect: "manual" });
  assert("GET /admin unauthenticated → redirect", r.status === 307 || r.status === 302);

  r = await req("POST", "/api/m/auction/fake/bid", { body: { amount: 100 } });
  assert("POST /api/m/* unauthenticated → 401", r.status === 401);

  // --- Admin login ---
  r = await req("POST", "/api/auth/admin/login", {
    body: { phone: "13900000001", password: "admin123" },
  });
  const adminCookie = extractCookie(r.setCookie, "sishi_admin_session");
  assert("Admin login → 200 + cookie", r.status === 200 && adminCookie);

  r = await req("GET", "/admin", { cookie: adminCookie });
  assert("GET /admin authenticated → 200", r.status === 200);

  // --- User login ---
  r = await req("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
  });
  const userCookie = extractCookie(r.setCookie, "sishi_user_session");
  assert("User login → 200 + cookie", r.status === 200 && userCookie);

  // --- Third-party token (404 in production) ---
  r = await req("GET", "/api/dev/third-party-token?u_id=test");
  assert("GET /api/dev/third-party-token in prod → 404", r.status === 404);

  // --- Auction bid (needs LIVE project) ---
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const live = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    select: { id: true, startPrice: true, bidStep: true },
  });
  if (!live) {
    assert("LIVE auction exists in DB", false, "run ensureDemoLiveAuction first");
  } else {
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: live.id },
      orderBy: { amount: "desc" },
    });
    const minBid = topBid
      ? Number(topBid.amount) + Number(live.bidStep)
      : Number(live.startPrice);

    r = await req("POST", `/api/m/auction/${live.id}/bid`, {
      body: { amount: minBid },
      cookie: userCookie,
    });
    assert("Place bid on LIVE auction → 200", r.status === 200 && r.json?.ok !== false, `status=${r.status} ${JSON.stringify(r.json)}`);

    // Duplicate deposit → 409
    r = await req("POST", "/api/m/payments/mock", {
      body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: live.id },
      cookie: userCookie,
    });
    assert("Duplicate AUCTION_DEPOSIT → 409", r.status === 409);
  }

  // --- Drying reserve ---
  const drying = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    select: { id: true },
  });
  if (drying) {
    // Use a unique far-future window to avoid collisions across runs
    const dayOffset = 60 + (Date.now() % 300);
    const start = new Date();
    start.setDate(start.getDate() + dayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const fmt = (d) => d.toISOString().slice(0, 10);

    r = await req("POST", "/api/m/drying/reserve", {
      body: { listingId: drying.id, startDate: fmt(start), endDate: fmt(end) },
      cookie: userCookie,
    });
    assert("Drying reserve → 200", r.status === 200 && r.json?.ok, `status=${r.status}`);

    // Overlapping duplicate → 409
    r = await req("POST", "/api/m/drying/reserve", {
      body: { listingId: drying.id, startDate: fmt(start), endDate: fmt(end) },
      cookie: userCookie,
    });
    assert("Duplicate drying reserve → 409", r.status === 409, `status=${r.status} ${JSON.stringify(r.json)}`);
  } else {
    assert("OPERATING drying listing exists", false);
  }

  await prisma.$disconnect();

  // --- Admin API guards ---
  r = await req("POST", "/api/admin/assets", { body: { name: "x" } });
  assert("POST /api/admin/assets unauthenticated → 401", r.status === 401);

  r = await req("POST", "/api/upload");
  assert("POST /api/upload unauthenticated → 401", r.status === 401);

  // --- Non-multipart asset create → 400 ---
  r = await req("POST", "/api/admin/assets", {
    body: { orgId: "x", type: "LAND", name: "test", locationText: "loc" },
    cookie: adminCookie,
    headers: { "Content-Type": "application/json" },
  });
  assert("POST /api/admin/assets non-multipart → 400", r.status === 400);

  // --- Logout ---
  r = await req("POST", "/api/auth/logout", { cookie: userCookie });
  assert("User logout → 200", r.status === 200);

  r = await req("POST", "/api/auth/admin/logout", { cookie: adminCookie });
  assert("Admin logout → 200", r.status === 200);

  // --- Register (new phone) ---
  const phone = `139${Date.now().toString().slice(-8)}`;
  r = await req("POST", "/api/auth/register", {
    body: { phone, password: "test1234", name: "冒烟用户" },
  });
  assert("User register → 200", r.status === 200);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
