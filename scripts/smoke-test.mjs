#!/usr/bin/env node
/**
 * API smoke test — run after `npm run build && npm start`.
 * Usage: NODE_ENV=production node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(method, path, { body, cookies, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) {
    h["Content-Type"] = "application/json";
  }
  if (cookies) h["Cookie"] = cookies;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return { status: res.status, text, json, headers: res.headers };
}

function parseCookies(setCookie) {
  if (!setCookie) return "";
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`Smoke test → ${BASE}\n`);

  // --- Auth ---
  const userLogin = await req("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
  });
  const userCookies = parseCookies(userLogin.headers.getSetCookie?.() ?? []);
  assert("user login 200", userLogin.status === 200 && userLogin.json?.ok);

  const adminLogin = await req("POST", "/api/auth/admin/login", {
    body: { phone: "13900000001", password: "admin123" },
  });
  const adminCookies = parseCookies(adminLogin.headers.getSetCookie?.() ?? []);
  assert("admin login 200", adminLogin.status === 200 && adminLogin.json?.ok);

  const badLogin = await req("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "wrong" },
  });
  assert("bad login 401", badLogin.status === 401);

  const dupReg = await req("POST", "/api/auth/register", {
    body: { phone: "13800138000", password: "user123" },
  });
  assert("duplicate register 409", dupReg.status === 409);

  // --- Unauthenticated mobile API ---
  const unauth = await req("POST", "/api/m/drying/reserve", { body: {} });
  assert("unauth /api/m/ 401", unauth.status === 401);

  // --- Content-Type guards ---
  const uploadBad = await req("POST", "/api/upload", {
    cookies: adminCookies,
    body: {},
  });
  assert("upload non-multipart 400", uploadBad.status === 400);

  const assetBad = await req("POST", "/api/admin/assets", {
    cookies: adminCookies,
    body: { name: "x" },
  });
  assert("admin assets non-multipart 400", assetBad.status === 400);

  const uploadNoAuth = await req("POST", "/api/upload");
  assert("upload no auth 401", uploadNoAuth.status === 401);

  // --- Pages ---
  const home = await req("GET", "/");
  assert("homepage 200", home.status === 200);

  const mLogin = await req("GET", "/m/login");
  assert("m login page 200", mLogin.status === 200);

  // --- DB-dependent (auction bid, drying) via inline prisma ---
  let auctionId = "";
  let dryingId = "";
  let orgId = "";
  try {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    const auction = await p.auctionProject.findFirst({ where: { status: "LIVE" } });
    const drying = await p.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
    const org = await p.organization.findFirst({ where: { level: "REGIMENT" } });
    auctionId = auction?.id ?? "";
    dryingId = drying?.id ?? "";
    orgId = org?.id ?? "";
    await p.$disconnect();
  } catch (e) {
    console.error("  ! Prisma lookup failed:", e.message);
  }

  assert("LIVE auction exists", !!auctionId, auctionId || "run db:seed");

  if (auctionId) {
    const bid = await req("POST", `/api/m/auction/${auctionId}/bid`, {
      cookies: userCookies,
      body: { amount: 8000 },
    });
    assert("auction bid 200 or 400", bid.status === 200 || bid.status === 400, `got ${bid.status}`);
  }

  if (dryingId) {
    const today = new Date().toISOString().slice(0, 10);
    const reserve = await req("POST", "/api/m/drying/reserve", {
      cookies: userCookies,
      body: { listingId: dryingId, startDate: today, endDate: today },
    });
    assert("drying reserve ok", reserve.status === 200 || reserve.status === 400, `got ${reserve.status}`);
  }

  if (orgId) {
    const fd = new FormData();
    fd.append("orgId", orgId);
    fd.append("type", "LAND");
    fd.append("name", "冒烟测试");
    fd.append("locationText", "测试");
    const res = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: fd,
    });
    assert("admin create asset 200", res.status === 200);
  }

  // --- Dev token (404 in production is expected) ---
  const devToken = await req("GET", "/api/dev/third-party-token?u_id=smoke");
  const devOk = devToken.status === 200 || devToken.status === 404;
  assert("dev third-party token 200|404", devOk, `got ${devToken.status}`);

  if (auctionId) {
    const deposit = await req("POST", "/api/m/payments/mock", {
      cookies: userCookies,
      body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId },
    });
    assert("auction deposit 409 (already paid)", deposit.status === 409, `got ${deposit.status}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
