#!/usr/bin/env node
/**
 * API smoke tests for sishi-zichan.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";

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
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
  }
  return { status: res.status, json, text, headers: res.headers };
}

function getCookie(headers, name) {
  const raw = headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  const single = headers.get("set-cookie");
  if (single) {
    const m = single.match(new RegExp(`${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // --- Public pages ---
  for (const path of ["/", "/m", "/m/login", "/admin/login"]) {
    const r = await fetch(`${BASE}${path}`);
    if (r.status === 200) ok(`GET ${path}`);
    else fail(`GET ${path}`, `status ${r.status}`);
  }

  // --- Dev third-party token ---
  const tok = await req("/api/dev/third-party-token?u_id=smoke_test_user");
  if (tok.status === 200 && tok.json?.token) ok("GET /api/dev/third-party-token");
  else fail("GET /api/dev/third-party-token", `${tok.status} ${tok.text}`);

  // --- Auth: register (may fail if exists) ---
  const regPhone = `199${Date.now().toString().slice(-8)}`;
  const reg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ phone: regPhone, password: "test1234", name: "冒烟测试" }),
  });
  if (reg.status === 200 || reg.status === 409) ok("POST /api/auth/register");
  else fail("POST /api/auth/register", `${reg.status} ${reg.text}`);

  // --- User login ---
  const login = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const userCookie = getCookie(login.headers, "sishi_user_session");
  if (login.status === 200 && userCookie) ok("POST /api/auth/login");
  else fail("POST /api/auth/login", `${login.status} cookie=${!!userCookie}`);

  const userHeaders = userCookie ? { Cookie: userCookie } : {};

  // --- Third-party SSO ---
  if (tok.json?.token) {
    const sso = await req("/api/auth/third-party", {
      method: "POST",
      body: JSON.stringify({ token: tok.json.token }),
    });
    if (sso.status === 200) ok("POST /api/auth/third-party");
    else fail("POST /api/auth/third-party", `${sso.status} ${sso.text}`);
  }

  // --- Admin login ---
  const adminLogin = await req("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookie = getCookie(adminLogin.headers, "sishi_admin_session");
  if (adminLogin.status === 200 && adminCookie) ok("POST /api/auth/admin/login");
  else fail("POST /api/auth/admin/login", `${adminLogin.status} cookie=${!!adminCookie}`);

  const adminHeaders = adminCookie ? { Cookie: adminCookie } : {};

  // --- Upload: non-multipart should 400/500 ---
  const uploadBad = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (uploadBad.status >= 400 && uploadBad.status < 500) ok("POST /api/upload (non-multipart → 4xx)");
  else fail("POST /api/upload (non-multipart)", `status ${uploadBad.status}`);

  // --- Upload: no auth → 401 ---
  const uploadNoAuth = await fetch(`${BASE}/api/upload`, { method: "POST" });
  if (uploadNoAuth.status === 401) ok("POST /api/upload (no auth → 401)");
  else fail("POST /api/upload (no auth)", `status ${uploadNoAuth.status}`);

  // --- Admin assets: non-multipart ---
  const assetBad = await fetch(`${BASE}/api/admin/assets`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (assetBad.status >= 400 && assetBad.status < 500) ok("POST /api/admin/assets (non-multipart → 4xx)");
  else fail("POST /api/admin/assets (non-multipart)", `status ${assetBad.status}`);

  // --- Auction bid: no auth → 401 ---
  const bidNoAuth = await req("/api/m/auction/fake-id/bid", {
    method: "POST",
    body: JSON.stringify({ amount: 100 }),
  });
  if (bidNoAuth.status === 401) ok("POST /api/m/auction/bid (no auth → 401)");
  else fail("POST /api/m/auction/bid (no auth)", `status ${bidNoAuth.status}`);

  // --- Find LIVE auction and test bid ---
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!project) {
      fail("LIVE auction exists", "none found — seed may need refresh");
    } else {
      ok(`LIVE auction found (${project.code})`);

      const reg2 = await prisma.auctionRegistration.findFirst({
        where: { projectId: project.id, endUserId: (await prisma.endUser.findUnique({ where: { phone: "13800138000" } }))?.id },
      });
      if (reg2?.depositPaid) {
        const bid = await req(`/api/m/auction/${project.id}/bid`, {
          method: "POST",
          headers: userHeaders,
          body: JSON.stringify({ amount: Number(project.startPrice) }),
        });
        if (bid.status === 200 || bid.status === 409) ok("POST /api/m/auction/bid (authenticated)");
        else fail("POST /api/m/auction/bid", `${bid.status} ${bid.text}`);
      } else {
        ok("POST /api/m/auction/bid (skipped — deposit not paid)");
      }
    }

    // --- Drying reserve ---
    const listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
    if (!listing) {
      fail("OPERATING drying listing", "none found");
    } else {
      ok(`OPERATING drying listing found (${listing.id})`);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);
      const reserve = await req("/api/m/drying/reserve", {
        method: "POST",
        headers: userHeaders,
        body: JSON.stringify({
          listingId: listing.id,
          startDate: tomorrow.toISOString().slice(0, 10),
          endDate: dayAfter.toISOString().slice(0, 10),
        }),
      });
      if (reserve.status === 200) ok("POST /api/m/drying/reserve");
      else if (reserve.status === 400) ok(`POST /api/m/drying/reserve (${reserve.json?.error || "capacity"})`);
      else fail("POST /api/m/drying/reserve", `${reserve.status} ${reserve.text}`);
    }

    // --- Mock payment duplicate deposit → 409 ---
    if (project) {
      const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
      const reg3 = await prisma.auctionRegistration.findFirst({
        where: { projectId: project.id, endUserId: user?.id },
      });
      if (reg3?.depositPaid) {
        const dupPay = await req("/api/m/payments/mock", {
          method: "POST",
          headers: userHeaders,
          body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
        });
        if (dupPay.status === 409) ok("POST /api/m/payments/mock (duplicate deposit → 409)");
        else fail("POST /api/m/payments/mock (duplicate)", `status ${dupPay.status} ${dupPay.text}`);
      }
    }

    // --- Dict categories ---
    const dictCount = await prisma.dictCategory.count();
    if (dictCount > 0) ok(`Dict categories seeded (${dictCount})`);
    else fail("Dict categories seeded", "count=0");
  } finally {
    await prisma.$disconnect();
  }

  // --- Logout ---
  const logout = await req("/api/auth/logout", { method: "POST", headers: userHeaders });
  if (logout.status === 200) ok("POST /api/auth/logout");
  else fail("POST /api/auth/logout", `${logout.status}`);

  const adminLogout = await req("/api/auth/admin/logout", { method: "POST", headers: adminHeaders });
  if (adminLogout.status === 200) ok("POST /api/auth/admin/logout");
  else fail("POST /api/auth/admin/logout", `${adminLogout.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
