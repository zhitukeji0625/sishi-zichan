#!/usr/bin/env node
/**
 * API smoke tests — run against `npm start` (production mode).
 * Optional env: BASE_URL, SMOKE_AUCTION_ID, SMOKE_LISTING_ID
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

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

async function json(method, path, { body, cookies, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookies ? { Cookie: cookies } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

function cookiePair(setCookie) {
  if (!setCookie) return "";
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(";")[0]).join("; ");
}

function utcDateStr(daysFromToday) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Smoke tests @ ${BASE}\n`);

  // Pages
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    assert(`GET ${path}`, res.status === 200, `status ${res.status}`);
  }
  const adminRedirect = await fetch(`${BASE}/admin`, { redirect: "manual" });
  assert("GET /admin redirects", adminRedirect.status === 307 || adminRedirect.status === 302);

  // User login
  const userLogin = await json("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
  });
  const userCookies = cookiePair(userLogin.headers.getSetCookie?.() ?? userLogin.headers.get("set-cookie"));
  assert("POST /api/auth/login", userLogin.status === 200 && userLogin.data?.ok);

  // Admin login
  const adminLogin = await json("POST", "/api/auth/admin/login", {
    body: { phone: "13900000001", password: "admin123" },
  });
  const adminCookies = cookiePair(adminLogin.headers.getSetCookie?.() ?? adminLogin.headers.get("set-cookie"));
  assert("POST /api/auth/admin/login", adminLogin.status === 200 && adminLogin.data?.ok);

  // Bad login
  const badLogin = await json("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "wrong" },
  });
  assert("POST /api/auth/login bad password", badLogin.status === 401);

  // Register duplicate
  const dupReg = await json("POST", "/api/auth/register", {
    body: { phone: "13800138000", password: "user123" },
  });
  assert("POST /api/auth/register duplicate", dupReg.status === 409);

  // Dev third-party token (404 when server runs in production — expected)
  const devToken = await json("GET", "/api/dev/third-party-token?u_id=smoke");
  assert(
    "GET /api/dev/third-party-token",
    devToken.status === 404 || (devToken.status === 200 && devToken.data?.token),
    `status ${devToken.status}`,
  );

  // Multipart guards
  const badUpload = await json("POST", "/api/upload", { cookies: adminCookies, body: {} });
  assert("POST /api/upload non-multipart", badUpload.status === 400);

  const badAsset = await json("POST", "/api/admin/assets", { cookies: adminCookies, body: {} });
  assert("POST /api/admin/assets non-multipart", badAsset.status === 400);

  // Resolve auction / listing IDs
  let auctionId = process.env.SMOKE_AUCTION_ID;
  let listingId = process.env.SMOKE_LISTING_ID;
  if (!auctionId || !listingId) {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    if (!auctionId) {
      const a = await prisma.auctionProject.findFirst({
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
      });
      auctionId = a?.id;
    }
    if (!listingId) {
      const l = await prisma.dryingFieldListing.findFirst({ orderBy: { createdAt: "desc" } });
      listingId = l?.id;
    }
    await prisma.$disconnect();
  }

  // Auction bid
  if (auctionId) {
    let bidAmount = 8000;
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const project = await prisma.auctionProject.findUnique({ where: { id: auctionId } });
      const top = await prisma.auctionBid.findFirst({
        where: { projectId: auctionId },
        orderBy: { amount: "desc" },
      });
      const start = Number(project?.startPrice ?? 8000);
      const step = Number(project?.bidStep ?? 200);
      const current = top ? Number(top.amount) : start - step;
      bidAmount = current + step;
      await prisma.$disconnect();
    } catch {
      bidAmount = 10000;
    }
    const bid = await json("POST", `/api/m/auction/${auctionId}/bid`, {
      cookies: userCookies,
      body: { amount: bidAmount },
    });
    assert("POST auction bid", bid.status === 200 && bid.data?.ok, `status ${bid.status} ${JSON.stringify(bid.data)}`);
  } else {
    assert("POST auction bid (skipped — no LIVE auction)", false, "run npm run db:seed");
  }

  // Drying reserve + duplicate 409
  if (listingId) {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
    let startDate = "";
    let endDate = "";
    for (let offset = 1; offset <= 30; offset++) {
      const s = utcDateStr(offset);
      const e = utcDateStr(offset + 1);
      const start = new Date(`${s}T00:00:00.000Z`);
      const end = new Date(`${e}T00:00:00.000Z`);
      const existing = demoUser
        ? await prisma.dryingReservation.findFirst({
            where: {
              listingId,
              endUserId: demoUser.id,
              status: { notIn: ["REJECTED", "CANCELLED"] },
              startDate: { lte: end },
              endDate: { gte: start },
            },
          })
        : null;
      if (!existing) {
        startDate = s;
        endDate = e;
        break;
      }
    }
    await prisma.$disconnect();
    if (!startDate) {
      assert("POST drying reserve (skipped — no free slot)", false);
    } else {
      const reserve = await json("POST", "/api/m/drying/reserve", {
        cookies: userCookies,
        body: { listingId, startDate, endDate },
      });
      assert("POST drying reserve", reserve.status === 200 && reserve.data?.ok, `status ${reserve.status}`);
      const dup = await json("POST", "/api/m/drying/reserve", {
        cookies: userCookies,
        body: { listingId, startDate, endDate },
      });
      assert("POST drying reserve duplicate 409", dup.status === 409, `status ${dup.status}`);
    }
  } else {
    assert("POST drying reserve (skipped — no listing)", false);
  }

  // Mock payment deposit already paid
  if (auctionId) {
    const pay = await json("POST", "/api/m/payments/mock", {
      cookies: userCookies,
      body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId },
    });
    assert("POST mock payment deposit already paid", pay.status === 409);
  }

  // Unauthenticated bid
  if (auctionId) {
    const noAuth = await json("POST", `/api/m/auction/${auctionId}/bid`, { body: { amount: 9000 } });
    assert("POST auction bid unauthenticated", noAuth.status === 401);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
