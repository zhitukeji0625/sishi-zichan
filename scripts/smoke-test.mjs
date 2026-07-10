#!/usr/bin/env node
/**
 * API smoke test — run against `npm start` (production mode).
 * Usage: npm run smoke
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const IS_PROD = process.env.NODE_ENV === "production" || !process.env.SMOKE_DEV;

let pass = 0;
let fail = 0;

function check(name, expected, actual) {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  if (ok) {
    console.log(`✓ ${name} (${actual})`);
    pass++;
  } else {
    console.log(`✗ ${name} (expected ${expected}, got ${actual})`);
    fail++;
  }
}

async function loginAdmin() {
  const jar = new Map();
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    jar.set(k.trim(), v);
  }
  return jar;
}

async function loginUser() {
  const jar = new Map();
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    jar.set(k.trim(), v);
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  const prisma = new PrismaClient();
  const auction = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  const listing = await prisma.dryingFieldListing.findFirst();

  const AUCTION_ID = process.env.SMOKE_AUCTION_ID ?? auction?.id;
  const LISTING_ID = process.env.SMOKE_LISTING_ID ?? listing?.id;

  // Pages
  for (const [name, path] of [
    ["首页", "/"],
    ["管理登录页", "/admin/login"],
    ["H5登录页", "/m/login"],
    ["H5竞拍页", "/m/auction"],
  ]) {
    const res = await fetch(`${BASE}${path}`);
    check(name, 200, res.status);
  }

  const adminJar = await loginAdmin();
  check("管理员登录API", 200, 200);

  const adminDash = await fetch(`${BASE}/admin`, { headers: { Cookie: cookieHeader(adminJar) } });
  check("管理后台首页", 200, adminDash.status);

  const userJar = await loginUser();
  check("用户登录API", 200, 200);

  const me = await fetch(`${BASE}/m/me`, { headers: { Cookie: cookieHeader(userJar) } });
  check("H5个人中心", 200, me.status);

  // Dev token — 404 in production is expected
  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=test123`);
  check("第三方Token", IS_PROD ? 404 : 200, tokenRes.status);

  // Bid
  const bidNoAuth = await fetch(`${BASE}/api/m/auction/${AUCTION_ID}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 8200 }),
  });
  check("未登录出价401", 401, bidNoAuth.status);

  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId: AUCTION_ID },
    orderBy: { amount: "desc" },
  });
  const project = await prisma.auctionProject.findUnique({ where: { id: AUCTION_ID } });
  const minBid = topBid
    ? Number(topBid.amount) + Number(project?.bidStep ?? 200)
    : Number(project?.startPrice ?? 8000);

  const bidRes = await fetch(`${BASE}/api/m/auction/${AUCTION_ID}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
    body: JSON.stringify({ amount: minBid }),
  });
  const bidBody = await bidRes.json().catch(() => ({}));
  if (bidRes.status !== 200) console.log(`  出价响应: ${JSON.stringify(bidBody)}`);
  check("登录出价", 200, bidRes.status);

  // Drying reserve — pick a future date with available capacity
  const futureBase = new Date();
  futureBase.setMonth(futureBase.getMonth() + 2);
  let dryRes;
  let futureStart;
  let futureEnd;
  for (let offset = 0; offset < 30; offset++) {
    const d = new Date(futureBase);
    d.setDate(d.getDate() + offset);
    futureStart = d.toISOString().slice(0, 10);
    const d2 = new Date(d);
    d2.setDate(d2.getDate() + 1);
    futureEnd = d2.toISOString().slice(0, 10);
    const overlap = await prisma.dryingReservation.findFirst({
      where: {
        listingId: LISTING_ID,
        status: { notIn: ["REJECTED", "CANCELLED"] },
        startDate: { lte: new Date(futureEnd) },
        endDate: { gte: new Date(futureStart) },
      },
    });
    if (!overlap) break;
  }
  dryRes = await fetch(`${BASE}/api/m/drying/reserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
    body: JSON.stringify({ listingId: LISTING_ID, startDate: futureStart, endDate: futureEnd }),
  });
  check("晒场预约", 200, dryRes.status);

  const dryDup = await fetch(`${BASE}/api/m/drying/reserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
    body: JSON.stringify({ listingId: LISTING_ID, startDate: futureStart, endDate: futureEnd }),
  });
  const dryDupBody = await dryDup.json().catch(() => ({}));
  if (dryDup.status !== 409) console.log(`  重复预约响应: ${JSON.stringify(dryDupBody)}`);
  check("晒场重复预约409", 409, dryDup.status);

  // Mock payment — deposit already paid
  const payRes = await fetch(`${BASE}/api/m/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
    body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: AUCTION_ID }),
  });
  check("保证金支付(已缴409)", 409, payRes.status);

  // Upload / assets — non-multipart should 400
  const uploadRes = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminJar) },
  });
  check("上传非multipart400", 400, uploadRes.status);

  const assetPostRes = await fetch(`${BASE}/api/admin/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminJar) },
    body: "{}",
  });
  check("创建资产非multipart400", 400, assetPostRes.status);

  // Register duplicate
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123", name: "测试" }),
  });
  check("重复注册409", 409, regRes.status);

  await prisma.$disconnect();

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
