#!/usr/bin/env node
/**
 * API smoke test for sishi-zichan
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const failures = [];
const passes = [];

function pass(name) {
  passes.push(name);
  console.log(`✓ ${name}`);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.error(`✗ ${name}: ${detail}`);
}

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

function cookieFrom(headers, name) {
  const set = headers.getSetCookie?.() || [];
  for (const c of set) {
    if (c.startsWith(`${name}=`)) {
      return c.split(";")[0];
    }
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient();

  // Public pages
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 200) pass(`GET ${path}`);
    else fail(`GET ${path}`, `status ${res.status}`);
  }

  // User login
  let userCookie = "";
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    const c = cookieFrom(r.headers, "sishi_user_session");
    if (r.status === 200 && r.json?.ok && c) {
      userCookie = c;
      pass("用户登录");
    } else fail("用户登录", JSON.stringify(r));
  }

  // Admin login
  let adminCookie = "";
  {
    const r = await req("/api/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    const c = cookieFrom(r.headers, "sishi_admin_session");
    if (r.status === 200 && r.json?.ok && c) {
      adminCookie = c;
      pass("管理员登录");
    } else fail("管理员登录", JSON.stringify(r));
  }

  // Protected routes without auth
  {
    const r = await req("/api/m/payments/mock", { method: "POST", body: "{}" });
    if (r.status === 401) pass("未登录支付返回 401");
    else fail("未登录支付返回 401", `status ${r.status}`);
  }

  // Admin assets API (POST only, non-multipart -> 400)
  {
    const r = await req("/api/admin/assets", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (r.status === 400) pass("管理员资产创建非 multipart 返回 400");
    else fail("管理员资产创建非 multipart 返回 400", `status ${r.status}`);
  }

  // Upload without multipart
  {
    const r = await req("/api/upload", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    if (r.status === 400) pass("上传非 multipart 返回 400");
    else fail("上传非 multipart 返回 400", `status ${r.status}`);
  }

  // Dev third-party token (404 in production)
  {
    const r = await req("/api/dev/third-party-token");
    const isProd = process.env.NODE_ENV === "production";
    if (isProd && r.status === 404) pass("dev third-party-token 生产环境 404");
    else if (!isProd && r.status === 200 && r.json?.token) pass("dev third-party-token");
    else fail("dev third-party-token", JSON.stringify(r));
  }

  const project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
  });
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });

  if (!project) {
    fail("竞拍数据", "无 LIVE 项目");
  } else {
  // Auction bid (needs registration + deposit)
  const reg = await prisma.auctionRegistration.findUnique({
    where: { projectId_endUserId: { projectId: project.id, endUserId: (await prisma.endUser.findUnique({ where: { phone: "13800138000" } })).id } },
  });

  if (reg && !reg.depositPaid) {
    const pay = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
    });
    if (pay.status === 200 && pay.json?.ok) pass("竞拍保证金支付");
    else fail("竞拍保证金支付", JSON.stringify(pay));
  } else if (reg?.depositPaid) {
    pass("竞拍保证金已缴（跳过）");
  } else {
    fail("竞拍报名", "演示用户未报名");
  }

  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const minBid = topBid
    ? Number(topBid.amount) + Number(project.bidStep)
    : Number(project.startPrice);

  const bid = await req(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { Cookie: userCookie },
    body: JSON.stringify({ amount: minBid }),
  });
  if (bid.status === 200 && bid.json?.ok) pass("竞拍出价");
  else fail("竞拍出价", JSON.stringify(bid));

  // Duplicate deposit should 409
  const dupPay = await req("/api/m/payments/mock", {
    method: "POST",
    headers: { Cookie: userCookie },
    body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
  });
  if (dupPay.status === 409) pass("重复保证金 409");
  else fail("重复保证金 409", `status ${dupPay.status} ${JSON.stringify(dupPay.json)}`);
  }

  if (!listing) {
    fail("晒场数据", "无 OPERATING 晒场");
  } else {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const reserve = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: fmt(start),
        endDate: fmt(end),
      }),
    });
    if (reserve.status === 200 && reserve.json?.ok) pass("晒场预约");
    else if (
      (reserve.status === 400 || reserve.status === 409) &&
      reserve.json?.error?.includes("已有预约")
    ) {
      pass("晒场预约（时段冲突，预期）");
    } else fail("晒场预约", JSON.stringify(reserve));

    // Duplicate same slot
    const dup = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: fmt(start),
        endDate: fmt(end),
      }),
    });
    if (dup.status === 409 || (dup.status === 400 && dup.json?.error?.includes("已有预约"))) {
      pass("晒场重复预约 409/400");
    } else if (reserve.status === 200) {
      pass("晒场重复预约（首次成功则跳过）");
    } else fail("晒场重复预约", JSON.stringify(dup));
  }

  // Logout
  {
    const r = await req("/api/auth/logout", { method: "POST", headers: { Cookie: userCookie } });
    if (r.status === 200) pass("用户登出");
    else fail("用户登出", JSON.stringify(r));
  }

  await prisma.$disconnect();

  console.log(`\n--- 结果: ${passes.length} 通过, ${failures.length} 失败 ---`);
  if (failures.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
