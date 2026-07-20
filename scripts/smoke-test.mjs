#!/usr/bin/env node
/**
 * API & page smoke tests for sishi-zichan.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

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

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    redirect: "manual",
    ...opts,
    headers: { ...(opts.headers ?? {}) },
  });
  const ct = res.headers.get("content-type") ?? "";
  let body = null;
  if (ct.includes("application/json")) {
    body = await res.json().catch(() => null);
  } else {
    body = await res.text().catch(() => "");
  }
  return { res, body };
}

function cookieJar(setCookie) {
  if (!setCookie) return "";
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(";")[0]).join("; ");
}

async function loginAdmin() {
  const { res, body } = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  if (!res.ok || !body?.ok) throw new Error(`admin login failed: ${res.status}`);
  return cookieJar(res.headers.getSetCookie?.() ?? res.headers.raw?.()?.["set-cookie"]);
}

async function loginUser() {
  const { res, body } = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  if (!res.ok || !body?.ok) throw new Error(`user login failed: ${res.status}`);
  return cookieJar(res.headers.getSetCookie?.() ?? res.headers.raw?.()?.["set-cookie"]);
}

async function testPages() {
  console.log("\n[Pages]");
  const pages = ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"];
  for (const p of pages) {
    const { res } = await req(p);
    if (res.status === 200) ok(`GET ${p}`);
    else fail(`GET ${p}`, `status ${res.status}`);
  }
}

async function testAuth() {
  console.log("\n[Auth]");
  const { res: badRes } = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "", password: "" }),
  });
  if (badRes.status === 400) ok("login rejects empty credentials");
  else fail("login rejects empty credentials", `status ${badRes.status}`);

  const adminCookie = await loginAdmin();
  ok("admin login");

  const userCookie = await loginUser();
  ok("user login");

  const { res: tokenRes, body: tokenBody } = await req("/api/dev/third-party-token?u_id=smoke-test");
  if (tokenRes.status === 200 && tokenBody?.token) ok("dev third-party token");
  else fail("dev third-party token", `status ${tokenRes.status}`);

  return { adminCookie, userCookie };
}

async function testAdminAPI(adminCookie) {
  console.log("\n[Admin API]");
  const { res: uploadRes } = await req("/api/upload", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (uploadRes.status === 400 || uploadRes.status === 415) ok("upload rejects non-multipart");
  else fail("upload rejects non-multipart", `status ${uploadRes.status}`);

  const { res: assetRes } = await req("/api/admin/assets", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (assetRes.status === 400 || assetRes.status === 415) ok("admin assets rejects non-multipart");
  else fail("admin assets rejects non-multipart", `status ${assetRes.status}`);

  const { res: noAuthRes } = await req("/api/upload", { method: "POST" });
  if (noAuthRes.status === 401) ok("upload requires auth");
  else fail("upload requires auth", `status ${noAuthRes.status}`);
}

async function testAuction(userCookie) {
  console.log("\n[Auction]");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const project = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  await prisma.$disconnect();
  if (!project) {
    fail("auction LIVE project exists", "none found");
    return;
  }
  ok("auction LIVE project exists");

  const { res: bidNoAuth } = await req(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 8200 }),
  });
  if (bidNoAuth.status === 401) ok("bid requires auth");
  else fail("bid requires auth", `status ${bidNoAuth.status}`);

  const { res: bidRes, body: bidBody } = await req(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { Cookie: userCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 8200 }),
  });
  if (bidRes.status === 200 && bidBody?.ok) ok("place bid");
  else fail("place bid", `${bidRes.status} ${JSON.stringify(bidBody)}`);

  const { res: dupPayRes } = await req("/api/m/payments/mock", {
    method: "POST",
    headers: { Cookie: userCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
  });
  if (dupPayRes.status === 409) ok("duplicate deposit payment rejected");
  else fail("duplicate deposit payment rejected", `status ${dupPayRes.status}`);
}

async function testDrying(userCookie) {
  console.log("\n[Drying]");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  await prisma.$disconnect();
  if (!listing) {
    fail("drying listing exists", "none found");
    return;
  }
  ok("drying listing exists");

  const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { res: badRes } = await req("/api/m/drying/reserve", {
    method: "POST",
    headers: { Cookie: userCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: listing.id, date: start }),
  });
  if (badRes.status === 400) ok("reserve rejects invalid params");
  else fail("reserve rejects invalid params", `status ${badRes.status}`);

  const { res: resRes, body: resBody } = await req("/api/m/drying/reserve", {
    method: "POST",
    headers: { Cookie: userCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: listing.id, startDate: start, endDate: end }),
  });
  if (resRes.status === 200 && resBody?.ok) ok("create drying reservation");
  else fail("create drying reservation", `${resRes.status} ${JSON.stringify(resBody)}`);
}

async function testRegister() {
  console.log("\n[Register]");
  const phone = `139${Date.now().toString().slice(-8)}`;
  const { res, body } = await req("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      password: "test1234",
      name: "冒烟测试用户",
      idCard: "650101199001019999",
    }),
  });
  if (res.status === 200 && body?.ok) ok("user registration");
  else fail("user registration", `${res.status} ${JSON.stringify(body)}`);
}

async function main() {
  console.log(`Smoke test → ${BASE}`);
  try {
    await testPages();
    const { adminCookie, userCookie } = await testAuth();
    await testAdminAPI(adminCookie);
    await testAuction(userCookie);
    await testDrying(userCookie);
    await testRegister();
  } catch (e) {
    fail("unexpected error", e.message);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }
}

main();
