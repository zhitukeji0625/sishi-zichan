#!/usr/bin/env node
/**
 * API smoke tests — requires production server: npm run build && npm start
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3000";
const USER_COOKIES = "/tmp/smoke-user-cookies.txt";
const ADMIN_COOKIES = "/tmp/smoke-admin-cookies.txt";

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  console.error(`  ✗ ${name}: ${detail}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, headers: res.headers };
}

async function loginUser() {
  const { status, json, headers } = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookie = headers.getSetCookie?.() ?? [];
  return { status, json, cookieHeader: cookie.join("; ") };
}

async function loginAdmin() {
  const { status, json, headers } = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookie = headers.getSetCookie?.() ?? [];
  return { status, json, cookieHeader: cookie.join("; ") };
}

async function main() {
  console.log(`Smoke tests against ${BASE}\n`);

  const prisma = new PrismaClient();
  let liveProject;
  let minBidAmount;
  let dryingListing;
  let dryingDateStr;
  try {
    const demoUser = await prisma.endUser.findUnique({
      where: { phone: "13800138000" },
      select: { id: true },
    });
    liveProject = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      select: { id: true, startPrice: true, bidStep: true },
    });
    if (liveProject) {
      const topBid = await prisma.auctionBid.findFirst({
        where: { projectId: liveProject.id },
        orderBy: { amount: "desc" },
        select: { amount: true },
      });
      const start = Number(liveProject.startPrice);
      const step = Number(liveProject.bidStep);
      minBidAmount = topBid ? Number(topBid.amount) + step : start;
    }
    dryingListing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
      select: { id: true },
    });
    if (dryingListing && demoUser) {
      for (let offset = 3; offset <= 30; offset++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + offset);
        const candidate = d.toISOString().slice(0, 10);
        const dayStart = new Date(candidate + "T00:00:00.000Z");
        const overlap = await prisma.dryingReservation.findFirst({
          where: {
            listingId: dryingListing.id,
            endUserId: demoUser.id,
            status: { notIn: ["REJECTED", "CANCELLED"] },
            startDate: { lte: dayStart },
            endDate: { gte: dayStart },
          },
        });
        if (!overlap) {
          dryingDateStr = candidate;
          break;
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  // 1. User login
  const userLogin = await loginUser();
  if (userLogin.status === 200 && userLogin.json?.ok) ok("user login");
  else fail("user login", `${userLogin.status} ${JSON.stringify(userLogin.json)}`);

  // 2. Admin login
  const adminLogin = await loginAdmin();
  if (adminLogin.status === 200 && adminLogin.json?.role === "DIVISION_ADMIN") ok("admin login");
  else fail("admin login", `${adminLogin.status} ${JSON.stringify(adminLogin.json)}`);

  // 3. Unauthenticated bid → 401
  if (liveProject) {
    const unauth = await fetchJson(`/api/m/auction/${liveProject.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 8000 }),
    });
    if (unauth.status === 401) ok("unauthenticated bid returns 401");
    else fail("unauthenticated bid returns 401", `got ${unauth.status}`);
  } else {
    fail("unauthenticated bid returns 401", "no LIVE auction in DB");
  }

  // 4. Valid bid on LIVE project
  if (liveProject && userLogin.cookieHeader && minBidAmount != null) {
    const bid = await fetchJson(`/api/m/auction/${liveProject.id}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userLogin.cookieHeader,
      },
      body: JSON.stringify({ amount: minBidAmount }),
    });
    if (bid.status === 200 && bid.json?.ok) ok("valid bid on LIVE project");
    else fail("valid bid on LIVE project", `${bid.status} ${JSON.stringify(bid.json)}`);
  } else if (!liveProject) {
    fail("valid bid on LIVE project", "no LIVE auction in DB");
  }

  // 5. Duplicate register → 409
  const dupReg = await fetchJson("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  if (dupReg.status === 409) ok("duplicate register returns 409");
  else fail("duplicate register returns 409", `got ${dupReg.status}`);

  // 6. Drying reserve
  if (dryingListing && userLogin.cookieHeader && dryingDateStr) {
    const reserve = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userLogin.cookieHeader,
      },
      body: JSON.stringify({
        listingId: dryingListing.id,
        startDate: dryingDateStr,
        endDate: dryingDateStr,
      }),
    });
    if (reserve.status === 200 && reserve.json?.ok) ok("drying reserve");
    else fail("drying reserve", `${reserve.status} ${JSON.stringify(reserve.json)}`);

    // 7. Duplicate drying reserve → 409
    const dupReserve = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userLogin.cookieHeader,
      },
      body: JSON.stringify({
        listingId: dryingListing.id,
        startDate: dryingDateStr,
        endDate: dryingDateStr,
      }),
    });
    if (dupReserve.status === 409) ok("duplicate drying reserve returns 409");
    else fail("duplicate drying reserve returns 409", `got ${dupReserve.status} ${JSON.stringify(dupReserve.json)}`);
  } else {
    fail("drying reserve", "no free drying date or listing");
    fail("duplicate drying reserve returns 409", "skipped");
  }

  // 8. Portal page
  const portal = await fetch(BASE + "/");
  if (portal.status === 200) ok("portal page 200");
  else fail("portal page 200", `got ${portal.status}`);

  // 9. Admin dashboard (authenticated)
  if (adminLogin.cookieHeader) {
    const admin = await fetch(BASE + "/admin", {
      headers: { Cookie: adminLogin.cookieHeader },
      redirect: "manual",
    });
    if (admin.status === 200) ok("admin dashboard 200");
    else fail("admin dashboard 200", `got ${admin.status}`);
  } else {
    fail("admin dashboard 200", "no admin cookie");
  }

  // 10. Dev third-party token (404 in production is expected)
  const devToken = await fetchJson("/api/dev/third-party-token?u_id=smoke");
  if (devToken.status === 404 || devToken.status === 200) {
    ok("dev third-party token endpoint reachable");
  } else {
    fail("dev third-party token endpoint reachable", `got ${devToken.status}`);
  }

  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
