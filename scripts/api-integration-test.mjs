#!/usr/bin/env node
/**
 * API integration tests against running dev server + DB
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();
let failed = 0;

function fail(msg) {
  console.error("FAIL:", msg);
  failed++;
}
function ok(msg) {
  console.log("OK:", msg);
}

async function loginUser() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const body = await res.json();
  if (!body.ok) fail(`user login: ${JSON.stringify(body)}`);
  else ok("user login");
  return cookie;
}

async function main() {
  const project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { asset: true },
  });
  if (!project) {
    fail("no LIVE auction project in seed");
    await prisma.$disconnect();
    process.exit(1);
  }

  const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const current = topBid ? Number(topBid.amount) : Number(project.startPrice);
  const nextBid = current + Number(project.bidStep);

  const cookie = await loginUser();

  // Auction bid
  const bidRes = await fetch(`${BASE}/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ amount: nextBid }),
  });
  const bidBody = await bidRes.json();
  if (!bidRes.ok || !bidBody.ok) {
    fail(`auction bid: ${bidRes.status} ${JSON.stringify(bidBody)}`);
  } else {
    ok(`auction bid at ${nextBid}`);
  }

  // Third-party auth
  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=integration-test`);
  const tokenData = await tokenRes.json();
  if (!tokenData.token) fail("third-party token");
  else {
    const tpRes = await fetch(`${BASE}/api/auth/third-party`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenData.token }),
    });
    const tpBody = await tpRes.json();
    if (!tpRes.ok || !tpBody.ok) fail(`third-party login: ${JSON.stringify(tpBody)}`);
    else ok("third-party login");
  }

  // Register (new phone)
  const phone = `199${String(Date.now()).slice(-8)}`;
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: "test1234", name: "集成测试" }),
  });
  const regBody = await regRes.json();
  if (!regRes.ok || !regBody.ok) fail(`register: ${JSON.stringify(regBody)}`);
  else ok(`register ${phone}`);

  // Drying reserve
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });
  if (listing) {
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const dryRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    const dryBody = await dryRes.json();
    if (dryRes.ok && dryBody.ok) ok("drying reserve");
    else if (dryRes.status === 400 && dryBody.error) ok(`drying reserve: ${dryBody.error}`);
    else fail(`drying reserve: ${dryRes.status} ${JSON.stringify(dryBody)}`);
  } else ok("drying reserve skipped (no listing)");

  // Admin login + asset page
  const adminRes = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookies = adminRes.headers.getSetCookie?.().map((c) => c.split(";")[0]).join("; ") ?? "";
  const adminBody = await adminRes.json();
  if (!adminBody.ok) fail("admin login");
  else ok("admin login");

  const adminPage = await fetch(`${BASE}/admin/assets`, {
    headers: { Cookie: adminCookies },
  });
  if (!adminPage.ok) fail(`admin assets page: ${adminPage.status}`);
  else ok("admin assets page");

  const auctionPage = await fetch(`${BASE}/m/auction/${project.id}`, {
    headers: { Cookie: cookie },
  });
  if (!auctionPage.ok) fail(`auction detail page: ${auctionPage.status}`);
  else ok("auction detail page");

  await prisma.$disconnect();
  console.log(failed ? `\n${failed} failure(s)` : "\nAll integration tests passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
