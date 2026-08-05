#!/usr/bin/env node
/**
 * API & page smoke tests for sishi-zichan.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";
const results = [];
let cookieJar = "";
let adminCookieJar = "";

function pass(name) {
  results.push({ name, ok: true });
  console.log(`✓ ${name}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}: ${detail}`);
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookieJar && !headers.Cookie) headers.Cookie = cookieJar;
  if (adminCookieJar && opts.admin) headers.Cookie = adminCookieJar;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const setCookie = res.headers.getSetCookie?.() || [];
  const joined = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (opts.admin && joined) adminCookieJar = joined;
  else if (joined) cookieJar = joined;
  let body = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) body = await res.json().catch(() => null);
  else body = await res.text().catch(() => "");
  return { res, body };
}

async function main() {
  // Pages
  for (const [name, path] of [
    ["GET /", "/"],
    ["GET /admin/login", "/admin/login"],
    ["GET /m", "/m"],
    ["GET /m/login", "/m/login"],
    ["GET /m/auction", "/m/auction"],
    ["GET /m/drying", "/m/drying"],
  ]) {
    const { res } = await req(path);
    if (res.status === 200) pass(name);
    else fail(name, `status ${res.status}`);
  }

  // Auth validation
  {
    const { res } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 400) pass("POST /api/auth/login empty -> 400");
    else fail("POST /api/auth/login empty -> 400", `status ${res.status}`);
  }

  {
    const { res } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    if (res.status === 401) pass("POST /api/auth/login wrong password -> 401");
    else fail("POST /api/auth/login wrong password -> 401", `status ${res.status}`);
  }

  {
    const { res, body } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    if (res.status === 200 && body?.ok) pass("POST /api/auth/login demo user");
    else fail("POST /api/auth/login demo user", `status ${res.status} ${JSON.stringify(body)}`);
  }

  {
    const { res } = await req("/api/auth/admin/login", {
      method: "POST",
      admin: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    if (res.status === 200) pass("POST /api/auth/admin/login division admin");
    else fail("POST /api/auth/admin/login division admin", `status ${res.status}`);
  }

  // Upload
  {
    const { res } = await req("/api/upload", {
      method: "POST",
      admin: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 400) pass("POST /api/upload non-multipart -> 400");
    else fail("POST /api/upload non-multipart -> 400", `status ${res.status}`);
  }

  {
    const { res } = await req("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 401) pass("POST /api/upload no auth -> 401");
    else fail("POST /api/upload no auth -> 401", `status ${res.status}`);
  }

  // Admin assets API (POST only)
  {
    const { res } = await req("/api/admin/assets", {
      method: "POST",
      admin: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 400) pass("POST /api/admin/assets invalid -> 400");
    else fail("POST /api/admin/assets invalid -> 400", `status ${res.status}`);
  }

  // Third-party token only in development
  {
    const { res, body } = await req("/api/dev/third-party-token?u_id=smoke_test");
    if (res.status === 200 && body?.token) {
      pass("GET /api/dev/third-party-token");
      const { res: ssoRes, body: ssoBody } = await req("/api/auth/third-party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: body.token }),
      });
      if (ssoRes.status === 200 && ssoBody?.ok) pass("POST /api/auth/third-party");
      else fail("POST /api/auth/third-party", `status ${ssoRes.status} ${JSON.stringify(ssoBody)}`);
    } else if (res.status === 404) {
      pass("GET /api/dev/third-party-token (disabled in production)");
      pass("POST /api/auth/third-party (skipped in production)");
    } else {
      fail("GET /api/dev/third-party-token", `status ${res.status}`);
    }
  }

  // Re-login demo user for auction tests
  await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });

  // Auction bid - need LIVE project
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const live = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });
  const anyProject = live || (await prisma.auctionProject.findFirst());
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  await prisma.$disconnect();

  if (!anyProject) {
    fail("auction project exists", "no projects in DB");
  } else if (anyProject.status !== "LIVE") {
    fail("demo auction LIVE", `project status is ${anyProject.status}`);
  } else {
    const startPrice = Number(anyProject.startPrice);
    const bidStep = Number(anyProject.bidStep ?? 200);
    const top = anyProject.bids?.[0]?.amount;
    const minBid = top ? Number(top) + bidStep : startPrice;
    const { res, body } = await req(`/api/m/auction/${anyProject.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: minBid }),
    });
    if (res.status === 200 && body?.ok) pass("POST /api/m/auction bid");
    else fail("POST /api/m/auction bid", `status ${res.status} ${JSON.stringify(body)}`);
  }

  // Drying reserve
  if (!listing) {
    fail("drying listing exists", "no operating listing");
  } else {
    const offset = 40 + (Date.now() % 300);
    const base = new Date();
    base.setDate(base.getDate() + offset);
    const endDate = new Date(base);
    endDate.setDate(endDate.getDate() + 2);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const start = fmt(base);
    const end = fmt(endDate);
    const { res, body } = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: listing.id, startDate: start, endDate: end }),
    });
    if (res.status === 200 && body?.ok) {
      pass("POST /api/m/drying/reserve");
      // duplicate should 409 or 400
      const dup = await req("/api/m/drying/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, startDate: start, endDate: end }),
      });
      if (dup.res.status === 409 || dup.res.status === 400) pass("POST /api/m/drying/reserve duplicate -> 409/400");
      else fail("POST /api/m/drying/reserve duplicate -> 409/400", `status ${dup.res.status}`);
    } else {
      fail("POST /api/m/drying/reserve", `status ${res.status} ${JSON.stringify(body)}`);
    }
  }

  // Register duplicate
  {
    const { res } = await req("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123", name: "dup" }),
    });
    if (res.status === 409) pass("POST /api/auth/register duplicate -> 409");
    else fail("POST /api/auth/register duplicate -> 409", `status ${res.status}`);
  }

  // Mock payment invalid
  {
    const { res } = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "INVALID" }),
    });
    if (res.status === 400) pass("POST /api/m/payments/mock invalid -> 400");
    else fail("POST /api/m/payments/mock invalid -> 400", `status ${res.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.error("\nFailures:");
    for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
