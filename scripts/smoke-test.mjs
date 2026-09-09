#!/usr/bin/env node
/**
 * HTTP smoke test for sishi-zichan (dev mode required).
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  errors.push({ name, detail });
  console.log(`  ✗ ${name}: ${detail}`);
}

async function req(method, path, { body, cookie, expectStatus = 200, expectJson } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookieStr = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, json, cookie: cookieStr, headers: res.headers };
}

async function main() {
  console.log(`\nSmoke test against ${BASE}\n`);

  // 1. Public pages
  for (const path of ["/", "/m", "/m/auction", "/m/drying", "/m/login", "/m/register"]) {
    const r = await req("GET", path);
    if (r.status === 200) ok(`GET ${path}`);
    else fail(`GET ${path}`, `status ${r.status}`);
  }

  // 2. Admin login page
  const adminLoginPage = await req("GET", "/admin/login");
  if (adminLoginPage.status === 200) ok("GET /admin/login");
  else fail("GET /admin/login", `status ${adminLoginPage.status}`);

  // 3. Admin redirect without auth
  const adminRedirect = await req("GET", "/admin");
  if (adminRedirect.status === 307 || adminRedirect.status === 302)
    ok("GET /admin → redirect when unauthenticated");
  else fail("GET /admin redirect", `status ${adminRedirect.status}`);

  // 4. User login
  const login = await req("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
    expectStatus: 200,
  });
  let userCookie = login.cookie;
  if (login.status === 200 && login.json?.ok) ok("POST /api/auth/login");
  else fail("POST /api/auth/login", JSON.stringify(login.json));

  // 5. Admin login
  const adminLogin = await req("POST", "/api/auth/admin/login", {
    body: { phone: "13900000001", password: "admin123" },
  });
  let adminCookie = adminLogin.cookie;
  if (adminLogin.status === 200 && adminLogin.json?.ok) ok("POST /api/auth/admin/login");
  else fail("POST /api/auth/admin/login", JSON.stringify(adminLogin.json));

  // 6. Third-party token (dev)
  const tpToken = await req("GET", "/api/dev/third-party-token?u_id=test_user");
  if (tpToken.status === 200 && tpToken.json?.token) ok("GET /api/dev/third-party-token");
  else fail("GET /api/dev/third-party-token", JSON.stringify(tpToken.json));

  // 7. Third-party auth
  if (tpToken.json?.token) {
    const tpAuth = await req("POST", "/api/auth/third-party", {
      body: { token: tpToken.json.token },
    });
    if (tpAuth.status === 200 && tpAuth.json?.ok) ok("POST /api/auth/third-party");
    else fail("POST /api/auth/third-party", JSON.stringify(tpAuth.json));
  }

  // 8. Register duplicate phone → 409
  const dupReg = await req("POST", "/api/auth/register", {
    body: { phone: "13800138000", password: "user123" },
  });
  if (dupReg.status === 409) ok("POST /api/auth/register duplicate → 409");
  else fail("POST /api/auth/register duplicate", `status ${dupReg.status}`);

  // 9. Register invalid password
  const badReg = await req("POST", "/api/auth/register", {
    body: { phone: "13900009998", password: "123" },
  });
  if (badReg.status === 400) ok("POST /api/auth/register short password → 400");
  else fail("POST /api/auth/register short password", `status ${badReg.status}`);

  // 10. Authenticated pages
  for (const path of ["/m/me", "/m/orders"]) {
    const r = await req("GET", path, { cookie: userCookie });
    if (r.status === 200) ok(`GET ${path} (authenticated)`);
    else fail(`GET ${path} (authenticated)`, `status ${r.status}`);
  }

  // 11. Admin pages
  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/dict"]) {
    const r = await req("GET", path, { cookie: adminCookie });
    if (r.status === 200) ok(`GET ${path} (admin)`);
    else fail(`GET ${path} (admin)`, `status ${r.status}`);
  }

  // 12. Unauthenticated API → 401
  const noAuthBid = await req("POST", "/api/m/auction/fake/bid", {
    body: { amount: 1000 },
  });
  if (noAuthBid.status === 401) ok("POST /api/m/auction/bid without auth → 401");
  else fail("POST /api/m/auction/bid without auth", `status ${noAuthBid.status}`);

  // 13. Get project/listing IDs from DB
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const project = await prisma.auctionProject.findFirst({
    include: {
      registrations: { where: { endUser: { phone: "13800138000" } } },
      bids: { orderBy: { amount: "desc" }, take: 1 },
    },
  });
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  await prisma.$disconnect();

  if (project) {
    const r = await req("GET", `/m/auction/${project.id}`, { cookie: userCookie });
    if (r.status === 200) ok(`GET /m/auction/${project.id}`);
    else fail(`GET /m/auction/${project.id}`, `status ${r.status}`);

    if (project.status === "LIVE") {
      const highest = project.bids[0];
      const minBid =
        (highest ? Number(highest.amount) : Number(project.startPrice)) +
        Number(project.bidStep);
      const bid = await req("POST", `/api/m/auction/${project.id}/bid`, {
        body: { amount: minBid },
        cookie: userCookie,
      });
      if (bid.status === 200 && bid.json?.ok) ok("POST /api/m/auction/bid (LIVE)");
      else fail("POST /api/m/auction/bid", JSON.stringify(bid.json));
    } else {
      console.log(`  ⚠ Skipping bid test: project status is ${project.status}`);
    }
  } else {
    fail("auction project lookup", "no project found");
  }

  if (listing) {
    const r = await req("GET", `/m/drying/${listing.id}`, { cookie: userCookie });
    if (r.status === 200) ok(`GET /m/drying/${listing.id}`);
    else fail(`GET /m/drying/${listing.id}`, `status ${r.status}`);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const reserve = await req("POST", "/api/m/drying/reserve", {
      body: {
        listingId: listing.id,
        startDate: fmt(tomorrow),
        endDate: fmt(dayAfter),
      },
      cookie: userCookie,
    });
    if (reserve.status === 200 && reserve.json?.ok) ok("POST /api/m/drying/reserve");
    else fail("POST /api/m/drying/reserve", JSON.stringify(reserve.json));
  } else {
    fail("drying listing lookup", "no OPERATING listing found");
  }

  // 14. Upload without multipart → 400
  const badUpload = await req("POST", "/api/upload", {
    body: { foo: "bar" },
    cookie: adminCookie,
  });
  if (badUpload.status === 400) ok("POST /api/upload non-multipart → 400");
  else fail("POST /api/upload non-multipart", `status ${badUpload.status}`);

  // 15. Asset API without multipart → 400
  const badAsset = await req("POST", "/api/admin/assets", {
    body: { name: "test" },
    cookie: adminCookie,
  });
  if (badAsset.status === 400) ok("POST /api/admin/assets non-multipart → 400");
  else fail("POST /api/admin/assets non-multipart", `status ${badAsset.status}`);

  // 16. Logout
  const logout = await req("POST", "/api/auth/logout", { cookie: userCookie });
  if (logout.status === 200) ok("POST /api/auth/logout");
  else fail("POST /api/auth/logout", `status ${logout.status}`);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e.name}: ${e.detail}`));
    process.exit(1);
  }
  console.log("All smoke tests passed!\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
