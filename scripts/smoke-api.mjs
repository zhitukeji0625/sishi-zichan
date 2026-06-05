#!/usr/bin/env node
/**
 * API smoke tests against running server (npm run start or dev).
 * Usage: node scripts/smoke-api.mjs
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
const failures = [];

function fail(name, msg) {
  console.log("FAIL:", name, msg);
  failures.push(name);
}

function ok(name) {
  console.log("OK:", name);
}

async function main() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  const demoReg = demoUser
    ? await prisma.auctionRegistration.findFirst({
        where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
        orderBy: { createdAt: "desc" },
      })
    : null;
  if (demoReg) {
    const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const starts = new Date(Date.now() - 60 * 1000);
    await prisma.auctionProject.update({
      where: { id: demoReg.projectId },
      data: { status: "LIVE", startsAt: starts, endsAt: ends },
    });
  }

  const project = await prisma.auctionProject.findFirst({
    where: demoReg ? { id: demoReg.projectId, status: "LIVE" } : { status: "LIVE" },
  });
  if (!project) {
    fail("setup", "no LIVE auction project");
    process.exit(1);
  }

  // User login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookies = (loginRes.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!loginRes.ok) {
    fail("user login", await loginRes.text());
  } else {
    ok("user login");
  }

  const top = await prisma.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const start = Number(project.startPrice);
  const step = Number(project.bidStep);
  const amount = top ? Number(top.amount) + step : start;

  const bidRes = await fetch(`${BASE}/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ amount }),
  });
  const bidJson = await bidRes.json();
  if (!bidRes.ok) fail("place bid", JSON.stringify(bidJson));
  else ok("place bid");

  const badPay = await fetch(`${BASE}/api/m/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ purpose: "INVALID" }),
  });
  if (badPay.status !== 400) fail("mock payment validation", `status ${badPay.status}`);
  else ok("mock payment validation");

  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "" }),
  });
  if (regRes.status !== 400) fail("register validation", `status ${regRes.status}`);
  else ok("register validation");

  // Admin login + page
  const adminRes = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookies = (adminRes.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!adminRes.ok) fail("admin login", await adminRes.text());
  else ok("admin login");

  const adminPage = await fetch(`${BASE}/admin/assets`, {
    headers: { Cookie: adminCookies },
    redirect: "manual",
  });
  if (adminPage.status !== 200) fail("admin assets page", `status ${adminPage.status}`);
  else ok("admin assets page");

  // Drying reserve
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });
  if (listing) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 2);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    const dryRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
      }),
    });
    const dryJson = await dryRes.json();
    if (!dryRes.ok && dryRes.status !== 400) {
      fail("drying reserve", JSON.stringify(dryJson));
    } else {
      ok(`drying reserve (${dryRes.status})`);
    }
  } else {
    ok("drying reserve (skipped, no listing)");
  }

  await prisma.$disconnect();
  if (failures.length) {
    console.error("\nFailed:", failures.join(", "));
    process.exit(1);
  }
  console.log("\nAll smoke tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
