#!/usr/bin/env node
/**
 * API smoke test — run against localhost:3000 with seeded DB.
 * Usage: node scripts/smoke-test.mjs
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

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

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    redirect: "manual",
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
  }
  return { res, text, json, status: res.status };
}

function getCookie(res, name) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // 1. Public pages
  {
    const { status } = await req("/", { method: "GET", headers: {} });
    status === 200 ? ok("GET /") : fail("GET /", `status ${status}`);
  }
  {
    const { status } = await req("/m", { method: "GET", headers: {} });
    status === 200 ? ok("GET /m") : fail("GET /m", `status ${status}`);
  }
  {
    const { status } = await req("/admin/login", { method: "GET", headers: {} });
    status === 200 ? ok("GET /admin/login") : fail("GET /admin/login", `status ${status}`);
  }

  // 2. Admin login
  let adminCookie = "";
  {
    const { res, json, status } = await req("/api/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminCookie = getCookie(res, "sishi_admin_session") || "";
    if (status === 200 && json?.ok) ok("POST /api/auth/admin/login");
    else fail("POST /api/auth/admin/login", `status ${status} ${JSON.stringify(json)}`);
  }

  // 3. Admin protected page
  {
    const { status } = await req("/admin", {
      method: "GET",
      headers: { Cookie: `sishi_admin_session=${adminCookie}` },
    });
    status === 200 ? ok("GET /admin (authenticated)") : fail("GET /admin", `status ${status}`);
  }

  // 4. Upload without multipart
  {
    const { status } = await req("/api/upload", {
      method: "POST",
      headers: { Cookie: `sishi_admin_session=${adminCookie}` },
      body: JSON.stringify({}),
    });
    status === 400 ? ok("POST /api/upload non-multipart → 400") : fail("POST /api/upload non-multipart", `status ${status}`);
  }

  // 5. User login
  let userCookie = "";
  {
    const { res, json, status } = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userCookie = getCookie(res, "sishi_user_session") || "";
    if (status === 200 && json?.ok) ok("POST /api/auth/login");
    else fail("POST /api/auth/login", `status ${status} ${JSON.stringify(json)}`);
  }

  // 6. Third-party token (dev)
  let ssoToken = "";
  {
    const { json, status } = await req("/api/dev/third-party-token?u_id=smoke_test_user", {
      method: "GET",
      headers: {},
    });
    if (status === 200 && json?.token) {
      ssoToken = json.token;
      ok("GET /api/dev/third-party-token");
    } else fail("GET /api/dev/third-party-token", `status ${status} ${JSON.stringify(json)}`);
  }

  // 7. SSO login
  {
    const { status } = await req(`/m/sso?token=${encodeURIComponent(ssoToken)}`, {
      method: "GET",
      headers: {},
    });
    [302, 307, 200].includes(status) ? ok("GET /m/sso?token=...") : fail("GET /m/sso", `status ${status}`);
  }

  // 8. Auction list page
  {
    const { status } = await req("/m/auction", {
      method: "GET",
      headers: { Cookie: `sishi_user_session=${userCookie}` },
    });
    status === 200 ? ok("GET /m/auction") : fail("GET /m/auction", `status ${status}`);
  }

  // 9. Find LIVE auction and bid
  const auctionId = await findLiveAuction();
  if (auctionId) {
    ok(`Found LIVE auction: ${auctionId}`);
    const minBid = await getMinBid(auctionId);
    const { json, status } = await req(`/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      headers: { Cookie: `sishi_user_session=${userCookie}` },
      body: JSON.stringify({ amount: minBid }),
    });
    if (status === 200 && json?.ok) ok(`POST bid amount=${minBid}`);
    else fail("POST bid", `status ${status} ${JSON.stringify(json)}`);
  } else {
    fail("LIVE auction", "none found — demo auction may be ENDED");
  }

  // 10. Drying reserve
  const listingId = await findDryingListing();
  if (listingId) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);
    const { json, status } = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: `sishi_user_session=${userCookie}` },
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      }),
    });
    if ([200, 409].includes(status)) ok(`POST /api/m/drying/reserve → ${status}`);
    else fail("POST /api/m/drying/reserve", `status ${status} ${JSON.stringify(json)}`);
  } else {
    fail("drying listing", "none found");
  }

  // 11. Mock payment idempotency
  if (auctionId) {
    const reg = await findRegistration(auctionId);
    if (reg?.depositPaid) {
      const { status } = await req("/api/m/payments/mock", {
        method: "POST",
        headers: { Cookie: `sishi_user_session=${userCookie}` },
        body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId }),
      });
      status === 409 ? ok("POST mock payment duplicate → 409") : fail("POST mock payment duplicate", `status ${status}`);
    }
  }

  // 12. Admin dict page
  {
    const { status, text } = await req("/admin/dict", {
      method: "GET",
      headers: { Cookie: `sishi_admin_session=${adminCookie}` },
    });
    if (status === 200 && !text.includes(">LIVE<")) ok("GET /admin/dict (labels localized)");
    else if (status === 200) fail("GET /admin/dict", "raw enum LIVE visible");
    else fail("GET /admin/dict", `status ${status}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

async function findLiveAuction() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const a = await p.auctionProject.findFirst({
      where: { status: "LIVE" },
      select: { id: true },
    });
    return a?.id ?? null;
  } finally {
    await p.$disconnect();
  }
}

async function getMinBid(projectId) {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const project = await p.auctionProject.findUnique({
      where: { id: projectId },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    const top = project?.bids[0]?.amount;
    const start = Number(project?.startPrice ?? 0);
    const step = Number(project?.bidStep ?? 200);
    return top ? Number(top) + step : start + step;
  } finally {
    await p.$disconnect();
  }
}

async function findDryingListing() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const l = await p.dryingFieldListing.findFirst({ select: { id: true } });
    return l?.id ?? null;
  } finally {
    await p.$disconnect();
  }
}

async function findRegistration(projectId) {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const user = await p.endUser.findUnique({ where: { phone: "13800138000" } });
    if (!user) return null;
    return p.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId: user.id } },
    });
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
