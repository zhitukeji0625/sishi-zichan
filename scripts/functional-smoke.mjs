#!/usr/bin/env node
/**
 * 功能冒烟测试：需先启动 `npm run dev`（默认 http://localhost:3000）
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name}: ${detail}`);
}

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const jar = {};
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function waitForServer(maxMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(BASE);
      if (res.ok || res.status === 307 || res.status === 308) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`服务未就绪: ${BASE}`);
}

async function getPage(path, cookies = {}) {
  const headers = {};
  const c = cookieHeader(cookies);
  if (c) headers.cookie = c;
  return fetch(`${BASE}${path}`, { headers, redirect: "manual" });
}

async function postJson(path, body, cookies = {}) {
  const headers = { "content-type": "application/json" };
  const c = cookieHeader(cookies);
  if (c) headers.cookie = c;
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function extractId(html, pattern) {
  const m = html.match(pattern);
  return m?.[1] ?? null;
}

async function main() {
  console.log(`\n功能冒烟测试 @ ${BASE}\n`);

  await waitForServer();

  // 公开页面
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const res = await getPage(path);
    if (res.status === 200) pass(`GET ${path}`);
    else fail(`GET ${path}`, `status ${res.status}`);
  }

  // 管理端登录
  const adminRes = await postJson("/api/auth/admin/login", {
    phone: "13900000001",
    password: "admin123",
  });
  const adminCookies = parseCookies(adminRes);
  if (adminRes.ok && adminCookies.sishi_admin_session) {
    pass("admin login");
  } else {
    fail("admin login", await adminRes.text());
  }

  const adminHome = await getPage("/admin", adminCookies);
  if (adminHome.status === 200) pass("admin dashboard");
  else fail("admin dashboard", `status ${adminHome.status}`);

  for (const path of ["/admin/assets", "/admin/auctions", "/admin/dict", "/admin/drying"]) {
    const res = await getPage(path, adminCookies);
    if (res.status === 200) pass(`GET ${path} (auth)`);
    else fail(`GET ${path} (auth)`, `status ${res.status}`);
  }

  const dictPage = await getPage("/admin/dict", adminCookies);
  const dictHtml = await dictPage.text();
  if (dictHtml.includes("资产类型") || dictHtml.includes("asset_type")) {
    pass("dict page has categories");
  } else {
    fail("dict page has categories", "missing expected content");
  }

  const assetsNew = await getPage("/admin/assets/new", adminCookies);
  const assetsHtml = await assetsNew.text();
  if (assetsHtml.includes("闲置土地") || assetsHtml.includes("LAND")) {
    pass("asset form type options");
  } else {
    fail("asset form type options", "dropdown empty");
  }

  // 用户登录
  const userRes = await postJson("/api/auth/login", {
    phone: "13800138000",
    password: "user123",
  });
  const userCookies = parseCookies(userRes);
  if (userRes.ok && userCookies.sishi_user_session) {
    pass("user login");
  } else {
    fail("user login", await userRes.text());
  }

  const meRes = await getPage("/m/me", userCookies);
  if (meRes.status === 200) pass("user /m/me");
  else fail("user /m/me", `status ${meRes.status}`);

  // 第三方 token（开发环境）
  const tpRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke_test`);
  const tpJson = await tpRes.json();
  if (tpRes.ok && tpJson.token) pass("dev third-party token");
  else fail("dev third-party token", JSON.stringify(tpJson));

  // 竞拍出价
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "asc" },
    include: { asset: true },
  });
  if (!project) {
    fail("auction bid", "no project in DB");
  } else if (project.status !== "LIVE") {
    fail("auction bid", `project status is ${project.status}`);
  } else {
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const minAmount = topBid
      ? Number(topBid.amount) + Number(project.bidStep)
      : Number(project.startPrice);

    const bidRes = await postJson(
      `/api/m/auction/${project.id}/bid`,
      { amount: minAmount },
      userCookies,
    );
    const bidJson = await bidRes.json();
    if (bidRes.ok && bidJson.ok && bidJson.bidId) {
      pass("auction place bid");
    } else {
      fail("auction place bid", JSON.stringify(bidJson));
    }
  }

  // 晒场预约
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });
  if (!listing) {
    fail("drying reserve", "no operating listing");
  } else {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const reserveRes = await postJson(
      "/api/m/drying/reserve",
      {
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
      userCookies,
    );
    const reserveJson = await reserveRes.json();
    if (reserveRes.ok && reserveJson.ok && reserveJson.orderNo) {
      pass("drying reservation");
    } else {
      fail("drying reserve", JSON.stringify(reserveJson));
    }
  }

  // 未登录保护
  const bidAnon = await postJson("/api/m/auction/fake/bid", { amount: 1 });
  if (bidAnon.status === 401) pass("bid requires auth");
  else fail("bid requires auth", `status ${bidAnon.status}`);

  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
