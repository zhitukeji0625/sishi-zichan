#!/usr/bin/env node
/**
 * API smoke tests — run against `npm start` (production) on localhost:3000.
 * Optional env: SMOKE_BASE_URL, SMOKE_AUCTION_ID, SMOKE_LISTING_ID
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

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

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json, text };
}

function cookieJar() {
  const cookies = new Map();
  return {
    store(res) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function main() {
  console.log(`Smoke test → ${BASE}\n`);

  // 1. Public pages
  {
    const { res } = await fetchJson("/");
    assert("GET /", res.status === 200);
    const { res: m } = await fetchJson("/m");
    assert("GET /m", m.status === 200);
    const { res: admin } = await fetchJson("/admin/login");
    assert("GET /admin/login", admin.status === 200);
  }

  // 2. Auth
  const userJar = cookieJar();
  const adminJar = cookieJar();
  {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userJar.store(res);
    assert("POST /api/auth/login", res.status === 200 && json?.ok);
    const { res: ar, json: aj } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminJar.store(ar);
    assert("POST /api/auth/admin/login", ar.status === 200 && aj?.ok);
  }

  // 3. Resolve auction / listing IDs
  let auctionId = process.env.SMOKE_AUCTION_ID;
  let listingId = process.env.SMOKE_LISTING_ID;
  if (!auctionId || !listingId) {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    if (!auctionId) {
      const ap = await p.auctionProject.findFirst({
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      auctionId = ap?.id;
    }
    if (!listingId) {
      const dl = await p.dryingFieldListing.findFirst({
        where: { status: "OPERATING" },
        select: { id: true },
      });
      listingId = dl?.id;
    }
    await p.$disconnect();
  }
  assert("LIVE auction exists", !!auctionId, auctionId ?? "run npm run db:seed");
  assert("OPERATING drying listing exists", !!listingId, listingId ?? "run npm run db:seed");

  // 4. Upload Content-Type guard
  {
    const { res, json } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { Cookie: adminJar.header(), "Content-Type": "application/json" },
      body: "{}",
    });
    assert("POST /api/upload rejects non-multipart", res.status === 400 && json?.error);
  }

  // 5. Admin assets Content-Type guard
  {
    const { res, json } = await fetchJson("/api/admin/assets", {
      method: "POST",
      headers: { Cookie: adminJar.header(), "Content-Type": "application/json" },
      body: "{}",
    });
    assert("POST /api/admin/assets rejects non-multipart", res.status === 400 && json?.error);
  }

  // 6. Unauthenticated bid
  {
    const { res, json } = await fetchJson(`/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 8200 }),
    });
    assert("POST bid without login → 401", res.status === 401 && json?.error);
  }

  // 7. Bid on LIVE auction
  if (auctionId) {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    const project = await p.auctionProject.findUnique({ where: { id: auctionId } });
    const top = await p.auctionBid.findFirst({
      where: { projectId: auctionId },
      orderBy: { amount: "desc" },
    });
    await p.$disconnect();
    const minBid = top
      ? Number(top.amount) + Number(project?.bidStep ?? 200)
      : Number(project?.startPrice ?? 8000);
    const { res, json } = await fetchJson(`/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      headers: { Cookie: userJar.header(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: minBid }),
    });
    assert("POST bid on LIVE auction", res.status === 200 && json?.ok, JSON.stringify(json));
    const { res: r2, json: j2 } = await fetchJson(`/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      headers: { Cookie: userJar.header(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: minBid - 1 }),
    });
    assert("POST bid below min increment → 400", r2.status === 400 && j2?.error);
  }

  // 8. Mock payment duplicate deposit
  if (auctionId) {
    const { res, json } = await fetchJson("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: userJar.header(), "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId }),
    });
    assert("POST mock deposit duplicate → 409", res.status === 409 && json?.error);
  }

  // 9. Drying reserve + duplicate
  if (listingId) {
    const base = new Date();
    base.setDate(base.getDate() + 30);
    const start = base.toISOString().slice(0, 10);
    base.setDate(base.getDate() + 1);
    const end = base.toISOString().slice(0, 10);
    const body = JSON.stringify({ listingId, startDate: start, endDate: end });
    const { res, json } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userJar.header(), "Content-Type": "application/json" },
      body,
    });
    assert("POST drying reserve", res.status === 200 && json?.ok, JSON.stringify(json));
    const { res: r2, json: j2 } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userJar.header(), "Content-Type": "application/json" },
      body,
    });
    assert("POST drying duplicate → 409", r2.status === 409 && j2?.error?.includes("已有预约"));
  }

  // 10. Dev third-party token (404 in production is expected)
  {
    const { res } = await fetchJson("/api/dev/third-party-token?u_id=smoke");
    const ok = res.status === 404 || res.status === 200;
    assert("GET /api/dev/third-party-token", ok, `status ${res.status}`);
  }

  // 11. Logout
  {
    const { res, json } = await fetchJson("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: userJar.header() },
    });
    assert("POST /api/auth/logout", res.status === 200 && json?.ok);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
