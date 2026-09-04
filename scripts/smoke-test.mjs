#!/usr/bin/env node
/**
 * API smoke tests for sishi-zichan platform.
 * Run: node scripts/smoke-test.mjs
 * Requires: dev server on localhost:3000, seeded DB
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  const msg = `${name}: ${detail}`;
  errors.push(msg);
  console.log(`  ✗ ${msg}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

function getCookie(res) {
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`\nSmoke tests against ${BASE}\n`);

  // 1. Public pages
  {
    const { res } = await fetchJson("/");
    res.status === 200 ? ok("GET / returns 200") : fail("GET /", `status ${res.status}`);
  }
  {
    const { res } = await fetchJson("/m");
    res.status === 200 ? ok("GET /m returns 200") : fail("GET /m", `status ${res.status}`);
  }

  // 2. Admin redirect when not logged in
  {
    const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
    res.status === 307 || res.status === 302
      ? ok("GET /admin redirects when unauthenticated")
      : fail("GET /admin redirect", `status ${res.status}`);
  }

  // 3. Admin login
  let adminCookie = "";
  {
    const { res, body } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminCookie = getCookie(res);
    if (res.status === 200 && body?.ok) ok("POST /api/auth/admin/login");
    else fail("POST /api/auth/admin/login", `status ${res.status} body=${JSON.stringify(body)}`);
  }

  // 4. User login
  let userCookie = "";
  {
    const { res, body } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userCookie = getCookie(res);
    if (res.status === 200 && body?.ok) ok("POST /api/auth/login");
    else fail("POST /api/auth/login", `status ${res.status} body=${JSON.stringify(body)}`);
  }

  // 5. Register duplicate phone → 409
  {
    const { res } = await fetchJson("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "13800138000",
        password: "user123",
        name: "重复用户",
      }),
    });
    res.status === 409 ? ok("POST /api/auth/register duplicate → 409") : fail("duplicate register", `status ${res.status}`);
  }

  // 6. Third-party token (dev only)
  {
    const { res, body } = await fetchJson("/api/dev/third-party-token?u_id=test-smoke");
    if (res.status === 200 && body?.token) ok("GET /api/dev/third-party-token");
    else fail("third-party-token", `status ${res.status}`);
  }

  // 7. Upload without auth → 401
  {
    const { res } = await fetchJson("/api/upload", { method: "POST" });
    res.status === 401 ? ok("POST /api/upload without auth → 401") : fail("upload no auth", `status ${res.status}`);
  }

  // 8. Upload non-multipart → 400
  {
    const { res } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    res.status === 400 ? ok("POST /api/upload non-multipart → 400") : fail("upload non-multipart", `status ${res.status}`);
  }

  // 9. Admin assets API (POST multipart — missing fields → 400)
  {
    const form = new FormData();
    const res = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: form,
    });
    res.status === 400 ? ok("POST /api/admin/assets missing fields → 400") : fail("POST /api/admin/assets", `status ${res.status}`);
  }

  // 10. LIVE auction from DB + bid
  let projectId = "";
  let nextBid = 0;
  {
    const live = await prisma.auctionProject.findFirst({
      where: { status: "LIVE", endsAt: { gt: new Date() } },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (!live) {
      fail("LIVE auction", "no active LIVE auction in DB");
    } else {
      projectId = live.id;
      const top = live.bids[0]?.amount ?? live.startPrice;
      nextBid = Number(top) + Number(live.bidStep);
      ok(`LIVE auction found: ${live.code}`);
    }
  }

  if (projectId && userCookie) {
    const { res, body } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: nextBid }),
    });
    if (res.status === 200 && body?.ok) ok(`POST bid amount=${nextBid}`);
    else fail("POST bid", `status ${res.status} body=${JSON.stringify(body)}`);
  }

  // 11. Drying listing reservation
  {
    const listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
    if (!listing) {
      fail("drying listing", "no OPERATING listing");
    } else if (!userCookie) {
      fail("drying reserve", "no user cookie");
    } else {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { res, body } = await fetchJson("/api/m/drying/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userCookie },
        body: JSON.stringify({
          listingId: listing.id,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
        }),
      });
      if (res.status === 200 || res.status === 201) ok("POST /api/m/drying/reserve");
      else fail("drying reserve", `status ${res.status} body=${JSON.stringify(body)}`);
    }
  }

  // 12. Mock payment endpoint exists
  {
    const { res } = await fetchJson("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ orderId: "nonexistent" }),
    });
    // Should not be 404 or 500 - expect 400/401/404 order not found
    res.status !== 500 ? ok("POST /api/m/payments/mock reachable") : fail("mock payment", `status ${res.status}`);
  }

  // 13. Admin logout
  {
    const { res } = await fetchJson("/api/auth/admin/logout", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    res.status === 200 ? ok("POST /api/auth/admin/logout") : fail("admin logout", `status ${res.status}`);
  }

  // 14. User logout
  {
    const { res } = await fetchJson("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: userCookie },
    });
    res.status === 200 ? ok("POST /api/auth/logout") : fail("user logout", `status ${res.status}`);
  }

  // 15. Dict categories exist
  {
    const count = await prisma.dictCategory.count();
    count > 0 ? ok(`dict categories: ${count}`) : fail("dict categories", "none found - seed-dict not run?");
  }

  await prisma.$disconnect();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
