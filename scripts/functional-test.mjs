#!/usr/bin/env node
/**
 * Functional smoke test against running dev server.
 * Usage: node scripts/functional-test.mjs [baseUrl]
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3000";
const prisma = new PrismaClient();
let pass = 0;
let fail = 0;

function check(name, expected, actual) {
  if (expected === actual) {
    console.log(`✓ ${name} (${actual})`);
    pass++;
  } else {
    console.log(`✗ ${name} (expected ${expected}, got ${actual})`);
    fail++;
  }
}

async function main() {
  const userJar = {};
  const adminJar = {};

  function parseSetCookie(res) {
    const cookies = res.headers.getSetCookie?.() ?? [];
    for (const c of cookies) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      if (k && v) userJar[k] = v;
    }
  }

  function cookieHeader(jar) {
    return Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  console.log("=== Page Routes ===");
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    check(`GET ${path}`, 200, res.status);
  }

  console.log("\n=== Auth APIs ===");
  let res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  parseSetCookie(res);
  check("POST /api/auth/login", 200, res.status);
  const loginBody = await res.json();
  check("login ok", true, loginBody.ok === true);

  res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of adminCookies) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    if (k && v) adminJar[k] = v;
  }
  check("POST /api/auth/admin/login", 200, res.status);

  res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
  });
  check("POST bad login", 401, res.status);

  res = await fetch(`${BASE}/api/dev/third-party-token?u_id=testuser`);
  check("GET /api/dev/third-party-token", 200, res.status);

  console.log("\n=== Auction Bid ===");
  let project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });
  if (!project) {
    const asset = await prisma.asset.findFirst({ where: { type: { not: "DRYING_FIELD" } } });
    if (asset) {
      project = await prisma.auctionProject.create({
        data: {
          code: `FT${Date.now()}`,
          assetId: asset.id,
          startPrice: 8000,
          bidStep: 200,
          depositAmount: 500,
          startsAt: new Date(Date.now() - 60000),
          endsAt: new Date(Date.now() + 7 * 86400000),
          status: "LIVE",
        },
        include: { bids: true },
      });
      const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
      if (user) {
        await prisma.auctionRegistration.upsert({
          where: { projectId_endUserId: { projectId: project.id, endUserId: user.id } },
          update: { status: "APPROVED", depositPaid: true },
          create: {
            projectId: project.id,
            endUserId: user.id,
            status: "APPROVED",
            depositPaid: true,
          },
        });
      }
    }
  }

  if (project) {
    const top = project.bids[0]?.amount ?? project.startPrice;
    const bidAmount = Number(top) + Number(project.bidStep);
    res = await fetch(`${BASE}/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userJar),
      },
      body: JSON.stringify({ amount: bidAmount }),
    });
    check(`POST bid ${bidAmount}`, 200, res.status);
    const bidBody = await res.json();
    if (bidBody.ok !== true) {
      console.log(`  bid error: ${JSON.stringify(bidBody)}`);
      fail++;
    }

    res = await fetch(`${BASE}/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userJar),
      },
      body: JSON.stringify({ amount: bidAmount - 50 }),
    });
    check("POST invalid bid", 400, res.status);
  } else {
    console.log("✗ No auction project available");
    fail++;
  }

  console.log("\n=== Drying Reserve ===");
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    res = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userJar),
      },
      body: JSON.stringify({ listingId: listing.id, startDate: start, endDate: end }),
    });
    check("POST drying reserve", 200, res.status);
    const dryBody = await res.json();
    if (dryBody.ok !== true) {
      console.log(`  drying error: ${JSON.stringify(dryBody)}`);
      fail++;
    }
  } else {
    console.log("✗ No drying listing");
    fail++;
  }

  console.log("\n=== Admin Pages ===");
  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying"]) {
    res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookieHeader(adminJar) } });
    check(`GET ${path}`, 200, res.status);
  }

  res = await fetch(`${BASE}/admin/assets`, { redirect: "manual" });
  check("GET /admin/assets no auth", 307, res.status);

  console.log("\n=== Admin Create Asset (FormData) ===");
  const org = await prisma.organization.findFirst({ where: { level: "COMPANY" } });
  if (org) {
    const fd = new FormData();
    fd.set("orgId", org.id);
    fd.set("type", "LAND");
    fd.set("name", "功能测试资产");
    fd.set("locationText", "测试地点");
    fd.set("specs", "1亩");
    res = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { Cookie: cookieHeader(adminJar) },
      body: fd,
    });
    check("POST /api/admin/assets", 200, res.status);
    const assetBody = await res.json();
    check("asset ok", true, assetBody.ok === true);
  }

  console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
