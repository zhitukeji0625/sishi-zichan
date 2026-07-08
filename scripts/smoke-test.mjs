#!/usr/bin/env node
/**
 * API smoke tests — run against `npm start` on localhost:3000
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

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
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, headers: res.headers };
}

function getCookie(headers, name) {
  const raw = headers.getSetCookie?.() ?? [];
  const list = raw.length ? raw : [headers.get("set-cookie")].filter(Boolean);
  for (const c of list) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function loginUser() {
  const r = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookie = getCookie(r.headers, "sishi_user_session");
  return { ...r, cookie };
}

async function loginAdmin() {
  const r = await req("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookie = getCookie(r.headers, "sishi_admin_session");
  return { ...r, cookie };
}

async function getLiveProjectId() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  const project = await p.auctionProject.findFirst({
    where: { status: "LIVE" },
    select: { id: true },
  });
  await p.$disconnect();
  return project?.id ?? null;
}

async function getRegimentOrgId() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  const org = await p.organization.findFirst({
    where: { code: "REG61" },
    select: { id: true },
  });
  await p.$disconnect();
  return org?.id ?? null;
}

async function getDryingListingId() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  const listing = await p.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    select: { id: true },
  });
  await p.$disconnect();
  return listing?.id ?? null;
}

async function main() {
  console.log(`Smoke tests → ${BASE}\n`);

  // --- Public pages ---
  for (const path of ["/", "/m", "/admin/login"]) {
    const r = await req(path);
    assert(`GET ${path} → 200`, r.status === 200, `got ${r.status}`);
  }

  // --- Dev token ---
  const devTok = await req("/api/dev/third-party-token?u_id=smoke");
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    assert("GET /api/dev/third-party-token → 404 in production", devTok.status === 404);
  } else {
    assert("GET /api/dev/third-party-token → 200 in dev", devTok.status === 200);
  }

  // --- Auth validation ---
  const badLogin = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "", password: "" }),
  });
  assert("POST /api/auth/login empty → 400", badLogin.status === 400);

  const badCreds = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
  });
  assert("POST /api/auth/login wrong password → 401", badCreds.status === 401);

  // --- User login ---
  const user = await loginUser();
  assert("POST /api/auth/login demo user → 200", user.status === 200 && user.json?.ok);
  assert("user session cookie set", !!user.cookie);

  const userHeaders = user.cookie ? { Cookie: user.cookie } : {};

  // --- Protected bid without auth ---
  const bidNoAuth = await req("/api/m/auction/fake/bid", {
    method: "POST",
    body: JSON.stringify({ amount: 100 }),
  });
  assert("POST bid without login → 401", bidNoAuth.status === 401);

  // --- LIVE auction bid ---
  const liveProjectId = await getLiveProjectId();
  if (liveProjectId) {
    const bid = await req(`/api/m/auction/${liveProjectId}/bid`, {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({ amount: 999999 }),
    });
    assert(
      "POST bid on LIVE project → 200",
      bid.status === 200 && bid.json?.ok,
      `got ${bid.status} ${JSON.stringify(bid.json)}`,
    );
  } else {
    console.warn("  ⚠ skip bid test: no LIVE auction project");
  }

  // --- Drying reserve validation ---
  const badReserve = await req("/api/m/drying/reserve", {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({ listingId: "x", startDate: "bad", endDate: "bad" }),
  });
  assert("POST drying reserve invalid → 400", badReserve.status === 400);

  const listingId = await getDryingListingId();
  if (listingId) {
    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = start;
    const reserve1 = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({ listingId, startDate: start, endDate: end }),
    });
    assert(
      "POST drying reserve valid → 200",
      reserve1.status === 200 && reserve1.json?.ok,
      `got ${reserve1.status} ${JSON.stringify(reserve1.json)}`,
    );
    const reserve2 = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({ listingId, startDate: start, endDate: end }),
    });
    assert(
      "POST drying reserve duplicate → 409",
      reserve2.status === 409,
      `got ${reserve2.status} ${JSON.stringify(reserve2.json)}`,
    );
  } else {
    console.warn("  ⚠ skip drying reserve test: no OPERATING listing");
  }

  // --- Admin login ---
  const admin = await loginAdmin();
  assert("POST /api/auth/admin/login → 200", admin.status === 200 && admin.json?.ok);
  assert("admin session cookie set", !!admin.cookie);

  const adminHeaders = admin.cookie ? { Cookie: admin.cookie } : {};

  // --- Admin upload without multipart ---
  const uploadJson = await req("/api/upload", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  assert("POST /api/upload non-multipart → 400", uploadJson.status === 400);

  // --- Admin asset create without multipart ---
  const assetJson = await req("/api/admin/assets", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ name: "test" }),
  });
  assert("POST /api/admin/assets non-multipart → 400", assetJson.status === 400);

  // --- Admin asset create with multipart (valid) ---
  const orgId = await getRegimentOrgId();
  if (orgId) {
    const form = new FormData();
    form.append("orgId", orgId);
  form.append("type", "LAND");
  form.append("name", `冒烟测试资产 ${Date.now()}`);
  form.append("locationText", "测试地点");
  const assetCreate = await fetch(`${BASE}/api/admin/assets`, {
    method: "POST",
    headers: adminHeaders,
    body: form,
    redirect: "manual",
  });
  const assetCreateJson = await assetCreate.json().catch(() => null);
  assert(
    "POST /api/admin/assets multipart → 200",
    assetCreate.status === 200 && assetCreateJson?.ok,
    `got ${assetCreate.status} ${JSON.stringify(assetCreateJson)}`,
  );
  } else {
    console.warn("  ⚠ skip asset create test: no REG61 org");
  }

  // --- Payment validation ---
  const badPay = await req("/api/m/payments/mock", {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({ purpose: "INVALID" }),
  });
  assert("POST mock payment invalid purpose → 400", badPay.status === 400);

  // --- Register duplicate phone ---
  const dupReg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      phone: "13800138000",
      password: "user123",
      name: "重复",
    }),
  });
  assert("POST register duplicate phone → 409", dupReg.status === 409);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
