#!/usr/bin/env node
/**
 * Integration smoke tests against running dev server + DB.
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
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
  const data = await res.json();
  return { jar, data, ok: res.ok && data.ok };
}

async function loginAdmin() {
  const jar = [];
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) jar.push(c.split(";")[0]);
  const data = await res.json();
  return { jar, data, ok: res.ok && data.ok };
}

function cookieHeader(jar) {
  return jar.join("; ");
}

async function main() {
  // User login
  const user = await loginUser();
  if (user.ok) pass("用户登录");
  else fail("用户登录", JSON.stringify(user.data));

  // Admin login
  const admin = await loginAdmin();
  if (admin.ok) pass("管理员登录");
  else fail("管理员登录", JSON.stringify(admin.data));

  // Third-party token
  const tpRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=integration-test`);
  const tpData = await tpRes.json();
  if (tpData.token) pass("第三方开发 token");
  else fail("第三方开发 token", JSON.stringify(tpData));

  // Third-party auth
  const ssoRes = await fetch(`${BASE}/api/auth/third-party`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tpData.token }),
  });
  const ssoData = await ssoRes.json();
  if (ssoRes.ok && ssoData.ok) pass("第三方 SSO 登录");
  else fail("第三方 SSO 登录", JSON.stringify(ssoData));

  // Pages
  const pages = ["/", "/m", "/m/auction", "/m/drying", "/admin/login"];
  for (const path of pages) {
    const r = await fetch(`${BASE}${path}`);
    if (r.ok) pass(`页面 ${path}`, String(r.status));
    else fail(`页面 ${path}`, String(r.status));
  }

  // Authenticated mobile pages
  for (const path of ["/m/me", "/m/orders", "/m/auction"]) {
    const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookieHeader(user.jar) } });
    if (r.ok) pass(`用户页面 ${path}`);
    else fail(`用户页面 ${path}`, String(r.status));
  }

  // Admin pages
  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying"]) {
    const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookieHeader(admin.jar) } });
    if (r.ok) pass(`管理页面 ${path}`);
    else fail(`管理页面 ${path}`, String(r.status));
  }

  // Auction bid
  const project = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  if (!project) {
    fail("竞拍出价", "无 LIVE 项目");
  } else {
    const top = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const minBid = top
      ? Number(top.amount) + Number(project.bidStep)
      : Number(project.startPrice);
    const bidRes = await fetch(`${BASE}/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(user.jar),
      },
      body: JSON.stringify({ amount: minBid }),
    });
    const bidData = await bidRes.json();
    if (bidRes.ok && bidData.ok) pass("竞拍出价", `amount=${minBid}`);
    else fail("竞拍出价", JSON.stringify(bidData));
  }

  // Drying reserve
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (!listing) {
    fail("晒场预约", "无运营中晒场");
  } else {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const dryRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(user.jar),
      },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    const dryData = await dryRes.json();
    if (dryRes.ok && dryData.ok) pass("晒场预约", dryData.orderNo);
    else fail("晒场预约", JSON.stringify(dryData));
  }

  // Mock payment - auction deposit (should fail if already paid)
  if (project) {
    const payRes = await fetch(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(user.jar),
      },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
    });
    const payData = await payRes.json();
    if (payRes.status === 409 && payData.error?.includes("已缴纳")) {
      pass("模拟支付（保证金已缴）", payData.error);
    } else if (payRes.ok && payData.ok) {
      pass("模拟支付保证金");
    } else {
      fail("模拟支付保证金", JSON.stringify(payData));
    }
  }

  // Register duplicate
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123", name: "重复" }),
  });
  const regData = await regRes.json();
  if (!regRes.ok) pass("重复注册拒绝", regData.error || String(regRes.status));
  else fail("重复注册拒绝", "应返回错误");

  // Admin asset POST without auth
  const noAuthRes = await fetch(`${BASE}/api/admin/assets`, { method: "POST" });
  if (noAuthRes.status === 401) pass("资产 API 未登录保护");
  else fail("资产 API 未登录保护", String(noAuthRes.status));

  // Upload API
  const uploadRes = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: cookieHeader(admin.jar) },
  });
  if (uploadRes.status === 400 || uploadRes.status === 401) {
    pass("上传 API 可达", String(uploadRes.status));
  } else if (uploadRes.ok) {
    pass("上传 API");
  } else {
    fail("上传 API", String(uploadRes.status));
  }

  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- 结果: ${results.length - failed.length}/${results.length} 通过 ---`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
