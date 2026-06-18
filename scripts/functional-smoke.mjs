#!/usr/bin/env node
/**
 * Functional smoke tests against a running dev server (default http://localhost:3000).
 * Usage: npm run test:functional
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function fail(name, detail) {
  failed++;
  console.error(`  ✗ ${name}: ${detail}`);
}

function pass(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* html or empty */
  }
  return { res, json, text };
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  const raw = set.length ? set : [res.headers.get("set-cookie")].filter(Boolean);
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function loginUser() {
  const { res, json } = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  if (!res.ok || !json?.ok) throw new Error(`user login failed: ${res.status}`);
  return cookieFrom(res);
}

async function loginAdmin() {
  const { res, json } = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  if (!res.ok || !json?.ok) throw new Error(`admin login failed: ${res.status}`);
  return cookieFrom(res);
}

async function main() {
  console.log(`Functional smoke tests → ${BASE}\n`);

  // 1. Public pages
  for (const path of ["/", "/m", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.ok) pass(`GET ${path} → ${res.status}`);
    else fail(`GET ${path}`, `status ${res.status}`);
  }

  // 2. Favicon / icon
  const iconRes = await fetch(`${BASE}/icon`);
  if (iconRes.ok) pass(`GET /icon → ${iconRes.status}`);
  else fail("GET /icon", `status ${iconRes.status}`);

  // 3. Admin login + protected page
  let adminCookie;
  try {
    adminCookie = await loginAdmin();
    pass("Admin login API");
  } catch (e) {
    fail("Admin login API", e.message);
    adminCookie = "";
  }

  if (adminCookie) {
    const adminPage = await fetch(`${BASE}/admin`, {
      headers: { Cookie: adminCookie },
      redirect: "manual",
    });
    if (adminPage.status === 200 || adminPage.status === 307) pass("Admin dashboard accessible");
    else fail("Admin dashboard", `status ${adminPage.status}`);

    const dictPage = await fetch(`${BASE}/admin/dict`, {
      headers: { Cookie: adminCookie },
    });
    if (dictPage.ok) pass("Admin dict page");
    else fail("Admin dict page", `status ${dictPage.status}`);
  }

  // 4. User login
  let userCookie;
  try {
    userCookie = await loginUser();
    pass("User login API");
  } catch (e) {
    fail("User login API", e.message);
    userCookie = "";
  }

  // 5. Third-party dev token
  const { res: tpRes, json: tpJson } = await fetchJson("/api/dev/third-party-token?u_id=smoke_test");
  if (tpRes.ok && tpJson?.token) pass("Dev third-party token");
  else fail("Dev third-party token", `status ${tpRes.status}`);

  // 6. Auction list page
  if (userCookie) {
    const auctionPage = await fetch(`${BASE}/m/auction`, {
      headers: { Cookie: userCookie },
    });
    if (auctionPage.ok) pass("User auction page");
    else fail("User auction page", `status ${auctionPage.status}`);
  }

  // 7. Find LIVE auction and place bid
  if (userCookie) {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (!project) {
      fail("Place bid", "no LIVE auction in database");
    } else {
      const startPrice = Number(project.startPrice);
      const bidStep = Number(project.bidStep);
      const top = project.bids[0] ? Number(project.bids[0].amount) : null;
      const amount = top ? top + bidStep : startPrice;

      const { res: bidRes, json: bidJson } = await fetchJson(
        `/api/m/auction/${project.id}/bid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: userCookie,
          },
          body: JSON.stringify({ amount }),
        },
      );
      if (bidRes.ok && bidJson?.ok && bidJson?.bidId) pass(`Place bid (${amount})`);
      else fail("Place bid", `${bidRes.status} ${bidJson?.error ?? ""}`);
    }
    await prisma.$disconnect();
  }

  // 8. Drying reservation
  if (userCookie) {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
    if (!listing) {
      fail("Drying reserve", "no OPERATING listing");
    } else {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 2);
      const { res: drRes, json: drJson } = await fetchJson("/api/m/drying/reserve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
        },
        body: JSON.stringify({
          listingId: listing.id,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
        }),
      });
      if (drRes.ok && drJson?.ok) pass("Drying reservation");
      else fail("Drying reserve", `${drRes.status} ${drJson?.error ?? ""}`);
    }
    await prisma.$disconnect();
  }

  // 9. Admin multipart upload
  if (adminCookie) {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const boundary = `----SmokeBoundary${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="smoke.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const uploadRes = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const uploadJson = await uploadRes.json().catch(() => null);
    if (uploadRes.ok && uploadJson?.url) pass("Admin image upload");
    else fail("Admin image upload", `${uploadRes.status} ${uploadJson?.error ?? ""}`);
  }

  // 10. Dict categories seeded
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const dictCount = await prisma.dictCategory.count();
  if (dictCount >= 10) pass(`Dict categories seeded (${dictCount})`);
  else fail("Dict categories", `only ${dictCount} categories`);
  await prisma.$disconnect();

  // 11. Build sanity: register validation
  const { res: regRes } = await fetchJson("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (regRes.status === 400) pass("Register validation (400 on empty)");
  else fail("Register validation", `expected 400, got ${regRes.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
