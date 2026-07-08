#!/usr/bin/env node
/**
 * API smoke tests — requires production server at BASE_URL (default http://localhost:3000).
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
    /* non-json */
  }
  return { status: res.status, json, text, headers: res.headers };
}

function cookieJar() {
  const cookies = new Map();
  return {
    store(res) {
      const set = res.headers.getSetCookie?.() ?? [];
      for (const c of set) {
        const [pair] = c.split(";");
        const [k, v] = pair.split("=");
        if (k && v) cookies.set(k.trim(), v.trim());
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function main() {
  console.log(`Smoke tests @ ${BASE}\n`);

  // --- Public pages ---
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const r = await req(path);
    assert(`GET ${path} → 200`, r.status === 200, `got ${r.status}`);
  }

  // --- Unauthenticated API ---
  {
    const r = await req("/api/m/payments/mock", { method: "POST", body: "{}" });
    assert("POST /api/m/payments/mock unauth → 401", r.status === 401);
  }
  {
    const r = await req("/api/auth/login", { method: "POST", body: JSON.stringify({}) });
    assert("POST /api/auth/login empty → 400", r.status === 400);
  }
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    assert("POST /api/auth/login wrong pwd → 401", r.status === 401);
  }
  {
    const r = await req("/api/upload", { method: "POST", body: "{}" });
    assert("POST /api/upload non-multipart → 401 or 400", r.status === 401 || r.status === 400, `got ${r.status}`);
  }

  // --- Third-party token (production returns 404) ---
  {
    const r = await req("/api/dev/third-party-token?u_id=test");
    const expected = process.env.NODE_ENV === "production" ? 404 : 200;
    assert(`GET /api/dev/third-party-token → ${expected}`, r.status === expected, `got ${r.status}`);
  }

  // --- User login ---
  const userJar = cookieJar();
  let userProjectId = null;
  let listingId = null;
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userJar.store(r);
    assert("User login → 200", r.status === 200 && r.json?.ok, JSON.stringify(r.json));
  }

  // --- Admin login ---
  const adminJar = cookieJar();
  {
    const r = await req("/api/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminJar.store(r);
    assert("Admin login → 200", r.status === 200 && r.json?.ok, JSON.stringify(r.json));
  }

  // --- Admin protected page ---
  {
    const r = await req("/admin", { headers: { Cookie: adminJar.header() } });
    assert("GET /admin with session → 200", r.status === 200, `got ${r.status}`);
  }

  // --- Auction bid (needs LIVE project) ---
  {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
    userProjectId = live?.id ?? null;
    const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
    listingId = listing?.id ?? null;
    await prisma.$disconnect();
    assert("DB has LIVE auction", !!userProjectId);
    assert("DB has OPERATING drying listing", !!listingId);
  }

  if (userProjectId) {
    const r = await req(`/api/m/auction/${userProjectId}/bid`, {
      method: "POST",
      headers: { Cookie: userJar.header() },
      body: JSON.stringify({ amount: 8200 }),
    });
    assert("POST bid → 200", r.status === 200 && r.json?.ok, JSON.stringify(r.json));
  }

  // --- Mock payment duplicate deposit → 409 ---
  if (userProjectId) {
    const r = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: userJar.header() },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: userProjectId }),
    });
    assert("POST mock AUCTION_DEPOSIT already paid → 409", r.status === 409, JSON.stringify(r.json));
  }

  // --- Drying reservation ---
  if (listingId) {
    const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const body = JSON.stringify({ listingId, startDate: start, endDate: end });
    const r1 = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userJar.header() },
      body,
    });
    assert("POST drying reserve → 200", r1.status === 200 && r1.json?.ok, JSON.stringify(r1.json));
    const r2 = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userJar.header() },
      body,
    });
    assert("POST drying reserve duplicate → 409", r2.status === 409, JSON.stringify(r2.json));
  }

  // --- Register duplicate phone → 409 ---
  {
    const r = await req("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    assert("POST register existing phone → 409", r.status === 409);
  }

  // --- Logout ---
  {
    const r = await req("/api/auth/logout", { method: "POST", headers: { Cookie: userJar.header() } });
    assert("POST user logout → 200", r.status === 200);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
