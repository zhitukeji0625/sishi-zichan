#!/usr/bin/env node
/**
 * Integration tests: DB + HTTP against localhost:3000
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();
let failed = 0;

function ok(name) {
  console.log(`  OK: ${name}`);
}
function fail(name, detail) {
  console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, headers: res.headers };
}

async function loginUser() {
  const jar = [];
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) jar.push(c.split(";")[0]);
  const json = await res.json();
  return { status: res.status, json, cookie: jar.join("; ") };
}

async function ensureLiveAuction() {
  let project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { asset: true },
  });
  if (project) return project;

  const asset = await prisma.asset.findFirst();
  if (!asset) throw new Error("No assets in DB");

  project = await prisma.auctionProject.create({
    data: {
      code: `IT${Date.now()}`,
      assetId: asset.id,
      startPrice: new Decimal(1000),
      bidStep: new Decimal(100),
      depositAmount: new Decimal(50),
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 7 * 86400000),
      status: "LIVE",
    },
    include: { asset: true },
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
  return project;
}

async function main() {
  console.log(`=== Integration tests @ ${BASE} ===\n`);

  const login = await loginUser();
  if (login.status === 200 && login.json?.ok) ok("user login API");
  else fail("user login API", `${login.status} ${JSON.stringify(login.json)}`);

  const live = await ensureLiveAuction();
  ok(`live auction project ${live.code}`);

  const top = await prisma.auctionBid.findFirst({
    where: { projectId: live.id },
    orderBy: { amount: "desc" },
  });
  const minBid = top
    ? Number(top.amount) + Number(live.bidStep)
    : Number(live.startPrice);

  const bidRes = await fetch(`${BASE}/api/m/auction/${live.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: login.cookie },
    body: JSON.stringify({ amount: minBid }),
  });
  const bidJson = await bidRes.json();
  if (bidRes.status === 200 && bidJson.ok) ok("HTTP auction bid");
  else fail("HTTP auction bid", `${bidRes.status} ${JSON.stringify(bidJson)}`);

  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dryRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: login.cookie },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    const dryJson = await dryRes.json();
    if (dryRes.status === 200 && dryJson.ok) ok("drying reserve");
    else fail("drying reserve", `${dryRes.status} ${JSON.stringify(dryJson)}`);
  } else {
    console.log("  SKIP: no operating drying listing");
  }

  const pages = ["/m/auction", `/m/auction/${live.id}`, "/m/drying", "/m/orders"];
  for (const p of pages) {
    const r = await fetch(`${BASE}${p}`, { headers: { Cookie: login.cookie } });
    if (r.status === 200) ok(`GET ${p}`);
    else fail(`GET ${p}`, String(r.status));
  }

  const adminRes = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookies = (adminRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const adminJson = await adminRes.json();
  if (adminRes.status === 200 && adminJson.ok) ok("admin login");
  else fail("admin login", `${adminRes.status}`);

  for (const p of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying"]) {
    const r = await fetch(`${BASE}${p}`, { headers: { Cookie: adminCookies } });
    if (r.status === 200) ok(`GET ${p}`);
    else fail(`GET ${p}`, String(r.status));
  }

  await prisma.$disconnect();
  console.log("");
  if (failed > 0) {
    console.log(`=== ${failed} test(s) failed ===`);
    process.exit(1);
  }
  console.log("=== All integration tests passed ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
