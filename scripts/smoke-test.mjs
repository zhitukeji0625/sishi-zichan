#!/usr/bin/env node
/**
 * HTTP smoke test for sishi-zichan (dev mode required).
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name}: ${detail}` : name;
    errors.push(msg);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    redirect: "manual",
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  const cookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, json, text, cookies, headers: res.headers };
}

function mergeCookies(existing, newCookies) {
  const jar = new Map();
  for (const c of (existing || "").split("; ").filter(Boolean)) {
    const [k, v] = c.split("=");
    if (k) jar.set(k, v);
  }
  for (const c of newCookies) {
    const part = c.split(";")[0];
    const [k, v] = part.split("=");
    if (k) jar.set(k, v);
  }
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function loginAdmin() {
  const r = await req("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookie = mergeCookies("", r.cookies);
  return { status: r.status, cookie, json: r.json };
}

async function loginUser() {
  const r = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookie = mergeCookies("", r.cookies);
  return { status: r.status, cookie, json: r.json };
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // --- Public pages ---
  for (const [path, expect] of [
    ["/", 200],
    ["/m", 200],
    ["/m/login", 200],
    ["/m/auction", 200],
    ["/m/drying", 200],
    ["/admin/login", 200],
  ]) {
    const r = await req(path);
    assert(`GET ${path} → ${expect}`, r.status === expect, `got ${r.status}`);
  }

  // Admin redirect when not logged in
  const adminDash = await req("/admin");
  assert("GET /admin → 307 redirect", adminDash.status === 307, `got ${adminDash.status}`);

  // --- Auth APIs ---
  const badLogin = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "", password: "" }),
  });
  assert("POST /api/auth/login empty → 400", badLogin.status === 400);

  const adminLogin = await loginAdmin();
  assert("POST /api/auth/admin/login → 200", adminLogin.status === 200);
  const adminCookie = adminLogin.cookie;

  const userLogin = await loginUser();
  assert("POST /api/auth/login → 200", userLogin.status === 200);
  const userCookie = userLogin.cookie;

  // Duplicate register
  const dupReg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  assert("POST /api/auth/register duplicate → 409", dupReg.status === 409);

  // Invalid register
  const badReg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ phone: "123", password: "abc" }),
  });
  assert("POST /api/auth/register invalid → 400", badReg.status === 400);

  // --- Dev third-party token ---
  const tp = await req("/api/dev/third-party-token?u_id=test-user");
  assert("GET /api/dev/third-party-token → 200", tp.status === 200 && tp.json?.token);

  // --- Upload without auth ---
  const uploadNoAuth = await req("/api/upload", { method: "POST", body: "{}" });
  assert("POST /api/upload no auth → 401", uploadNoAuth.status === 401);

  // Upload non-multipart with auth
  const uploadBad = await req("/api/upload", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert(
    "POST /api/upload non-multipart → 400",
    uploadBad.status === 400,
    `got ${uploadBad.status}`,
  );

  // --- Asset API ---
  const assetNoAuth = await req("/api/admin/assets", { method: "POST", body: "{}" });
  assert("POST /api/admin/assets no auth → 401", assetNoAuth.status === 401);

  const assetBad = await req("/api/admin/assets", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert(
    "POST /api/admin/assets non-multipart → 400",
    assetBad.status === 400,
    `got ${assetBad.status}`,
  );

  // --- Drying reserve without auth ---
  const dryNoAuth = await req("/api/m/drying/reserve", {
    method: "POST",
    body: JSON.stringify({ listingId: "x", startDate: "2026-10-01", endDate: "2026-10-02" }),
  });
  assert("POST /api/m/drying/reserve no auth → 401", dryNoAuth.status === 401);

  // --- Bid without auth ---
  const bidNoAuth = await req("/api/m/auction/fake/bid", {
    method: "POST",
    body: JSON.stringify({ amount: 100 }),
  });
  assert("POST /api/m/auction/bid no auth → 401", bidNoAuth.status === 401);

  // --- Authenticated pages ---
  const mePage = await req("/m/me", { headers: { Cookie: userCookie } });
  assert("GET /m/me logged in → 200", mePage.status === 200, `got ${mePage.status}`);

  const adminPage = await req("/admin/dict", { headers: { Cookie: adminCookie } });
  assert("GET /admin/dict logged in → 200", adminPage.status === 200, `got ${adminPage.status}`);

  // --- Logout ---
  const logout = await req("/api/auth/logout", {
    method: "POST",
    headers: { Cookie: userCookie },
  });
  assert("POST /api/auth/logout → 200", logout.status === 200);

  // --- Bid on LIVE auction (re-login) ---
  const userLogin2 = await loginUser();
  const userCookie2 = userLogin2.cookie;
  let projectId = process.env.SMOKE_AUCTION_ID;
  if (!projectId) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const live = await prisma.auctionProject.findFirst({
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      projectId = live?.id;
      await prisma.$disconnect();
    } catch {
      /* DB unavailable — skip bid test */
    }
  }
  if (projectId) {
    const bid = await req(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { Cookie: userCookie2 },
      body: JSON.stringify({ amount: 99999 }),
    });
    assert("POST /api/m/auction/bid authenticated → 200", bid.status === 200, `got ${bid.status}`);
  } else {
    console.log("  ⊘ POST /api/m/auction/bid — skipped (no LIVE project)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
