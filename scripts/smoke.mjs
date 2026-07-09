#!/usr/bin/env node
/**
 * Smoke tests for sishi-zichan API (production mode, http://localhost:3000)
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

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
    console.log(`  ✗ ${msg}`);
  }
}

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}) },
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
  }
  return { res, text, json, status: res.status };
}

function extractCookie(setCookie) {
  if (!setCookie) return "";
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

async function loginUser() {
  const { res, json } = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookie = extractCookie(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
  return { status: res.status, cookie, json };
}

async function loginAdmin() {
  const { res, json } = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookie = extractCookie(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
  return { status: res.status, cookie, json };
}

async function main() {
  console.log(`\nSmoke tests @ ${BASE}\n`);

  // --- Public pages ---
  console.log("Public pages");
  for (const path of ["/", "/m", "/m/auction", "/m/drying", "/admin/login"]) {
    const { status } = await req(path);
    assert(`${path} returns 200`, status === 200, `got ${status}`);
  }

  // --- Auth gates ---
  console.log("\nAuth gates");
  const bid401 = await req("/api/m/auction/fake/bid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  assert("bid without login → 401", bid401.status === 401);

  const adminRedirect = await req("/admin");
  assert("/admin without cookie → redirect", adminRedirect.status === 307 || adminRedirect.status === 302);

  // --- User login ---
  console.log("\nUser auth");
  const userLogin = await loginUser();
  assert("user login → 200", userLogin.status === 200, `got ${userLogin.status}`);
  assert("user login sets cookie", userLogin.cookie.includes("sishi_user_session"));

  // --- Admin login ---
  console.log("\nAdmin auth");
  const adminLogin = await loginAdmin();
  assert("admin login → 200", adminLogin.status === 200, `got ${adminLogin.status}`);
  assert("admin login sets cookie", adminLogin.cookie.includes("sishi_admin_session"));

  const userCookie = userLogin.cookie;
  const adminCookie = adminLogin.cookie;

  // --- Dev third-party token ---
  console.log("\nThird-party token (dev)");
  const tp = await req("/api/dev/third-party-token?u_id=smoke-test");
  const isProd = process.env.SMOKE_PROD === "1" || process.env.NODE_ENV === "production";
  if (isProd) {
    assert("dev third-party-token → 404 in production", tp.status === 404, `got ${tp.status}`);
  } else {
    assert("dev third-party-token → 200", tp.status === 200, `got ${tp.status}`);
    assert("dev third-party-token has token", tp.json?.token);
  }

  // --- LIVE auction & bid ---
  console.log("\nAuction");
  const auctionPage = await req("/m/auction", { headers: { Cookie: userCookie } });
  assert("/m/auction accessible when logged in", auctionPage.status === 200);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  if (!live) {
    assert("LIVE auction exists in DB", false, "no LIVE project — run ensureDemoLiveAuction");
  } else {
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: live.id },
      orderBy: { amount: "desc" },
    });
    const minAmount = topBid
      ? Number(topBid.amount) + Number(live.bidStep)
      : Number(live.startPrice);
    const bid = await req(`/api/m/auction/${live.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: minAmount }),
    });
    assert("place bid → 200", bid.status === 200, `got ${bid.status}: ${bid.text}`);
  }

  // --- Mock payment duplicate deposit ---
  if (live) {
    const payDup = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: live.id }),
    });
    assert("duplicate auction deposit → 409", payDup.status === 409, `got ${payDup.status}`);
  }

  // --- Drying reservation ---
  console.log("\nDrying reservation");
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
    let startStr = "";
    let endStr = "";
    const todayUtc = new Date();
    for (let offset = 3; offset <= 60; offset++) {
      const start = new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() + offset),
      );
      const end = new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() + offset + 1),
      );
      const s = start.toISOString().slice(0, 10);
      const e = end.toISOString().slice(0, 10);
      const overlap = demoUser
        ? await prisma.dryingReservation.findFirst({
            where: {
              listingId: listing.id,
              endUserId: demoUser.id,
              status: { notIn: ["REJECTED", "CANCELLED"] },
              startDate: { lte: end },
              endDate: { gte: start },
            },
          })
        : null;
      if (!overlap) {
        startStr = s;
        endStr = e;
        break;
      }
    }
    assert("found available drying slot", !!startStr, "no free slot in next 60 days");

    const reserve = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ listingId: listing.id, startDate: startStr, endDate: endStr }),
    });
    assert("drying reserve → 200", reserve.status === 200, `got ${reserve.status}: ${reserve.text}`);

    const reserveDup = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ listingId: listing.id, startDate: startStr, endDate: endStr }),
    });
    assert("duplicate drying reserve → 409", reserveDup.status === 409, `got ${reserveDup.status}: ${reserveDup.text}`);
  } else {
    assert("OPERATING drying listing exists", false);
  }

  // --- Upload ---
  console.log("\nUpload");
  const noFile = await req("/api/upload", {
    method: "POST",
    headers: { Cookie: adminCookie },
  });
  assert("upload without multipart → 400", noFile.status === 400, `got ${noFile.status}`);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "test.png");
  const upload = await req("/api/upload", { method: "POST", headers: { Cookie: adminCookie }, body: form });
  assert("upload PNG → 200", upload.status === 200, `got ${upload.status}: ${upload.text}`);
  if (upload.json?.url) {
    const img = await req(upload.json.url);
    assert("uploaded image accessible", img.status === 200);
  }

  // --- Admin asset non-multipart ---
  console.log("\nAdmin assets");
  const assetBad = await req("/api/admin/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ name: "x" }),
  });
  assert("admin asset without multipart → 400", assetBad.status === 400, `got ${assetBad.status}`);

  await prisma.$disconnect();

  // --- Summary ---
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
