#!/usr/bin/env node
/**
 * API 功能冒烟测试（需服务运行在 BASE_URL，默认 http://localhost:3000）
 * 用法：node scripts/functional-smoke.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE_JAR = { admin: "", user: "" };

let passed = 0;
let failed = 0;

function log(ok, name, detail = "") {
  if (ok) {
    passed++;
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(method, path, { body, headers = {}, cookie } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    h["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload, redirect: "manual" });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, setCookie, location: res.headers.get("location") };
}

function extractCookie(setCookies, name) {
  for (const c of setCookies) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return "";
}

async function main() {
  console.log(`\n功能冒烟测试 @ ${BASE}\n`);

  for (const [name, path] of [
    ["门户首页", "/"],
    ["H5 首页", "/m"],
    ["管理登录页", "/admin/login"],
    ["竞拍列表", "/m/auction"],
    ["晒场列表", "/m/drying"],
  ]) {
    const r = await req("GET", path);
    log(r.status === 200, name, `HTTP ${r.status}`);
  }

  const fav = await req("GET", "/favicon.ico");
  log(fav.status === 200 || fav.status === 307 || fav.status === 308, "favicon", `HTTP ${fav.status}`);

  const adminLogin = await req("POST", "/api/auth/admin/login", {
    body: { phone: "13900000001", password: "admin123" },
  });
  log(adminLogin.status === 200 && adminLogin.json?.ok, "管理员登录", JSON.stringify(adminLogin.json));
  COOKIE_JAR.admin = extractCookie(adminLogin.setCookie, "sishi_admin_session");

  const userLogin = await req("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
  });
  log(userLogin.status === 200 && userLogin.json?.ok, "用户登录", JSON.stringify(userLogin.json));
  COOKIE_JAR.user = extractCookie(userLogin.setCookie, "sishi_user_session");

  const tpToken = await req("GET", "/api/dev/third-party-token?u_id=smoke_test");
  const tpDevUnavailable = tpToken.status === 404;
  log(
    tpDevUnavailable || (tpToken.status === 200 && tpToken.json?.token),
    "第三方 token",
    tpDevUnavailable ? "生产环境已禁用（预期）" : tpToken.json?.token ? "ok" : `HTTP ${tpToken.status}`,
  );

  if (tpToken.json?.token) {
    const tpLogin = await req("POST", "/api/auth/third-party", {
      body: { token: tpToken.json.token },
    });
    log(tpLogin.status === 200 && tpLogin.json?.ok, "第三方登录", JSON.stringify(tpLogin.json));
  }

  const uploadNoAuth = await req("POST", "/api/upload");
  log(uploadNoAuth.status === 401, "上传未登录拒绝", `HTTP ${uploadNoAuth.status}`);

  const uploadBad = await req("POST", "/api/upload", { cookie: COOKIE_JAR.admin });
  log(uploadBad.status === 400, "上传非 multipart 拒绝", `HTTP ${uploadBad.status}`);

  const assetBad = await req("POST", "/api/admin/assets", {
    cookie: COOKIE_JAR.admin,
    body: { orgId: "x", type: "LAND", name: "t", locationText: "t" },
  });
  log(assetBad.status === 400, "资产创建非 multipart 拒绝", `HTTP ${assetBad.status}`);

  for (const [name, path] of [
    ["管理首页", "/admin"],
    ["资产列表", "/admin/assets"],
    ["竞拍管理", "/admin/auctions"],
    ["报名审核", "/admin/registrations"],
    ["公告管理", "/admin/announcements"],
    ["晒场管理", "/admin/drying"],
    ["组织管理", "/admin/organizations"],
    ["管理员", "/admin/admins"],
    ["系统配置", "/admin/config"],
    ["数据字典", "/admin/dict"],
    ["操作审计", "/admin/audit"],
  ]) {
    const r = await req("GET", path, { cookie: COOKIE_JAR.admin });
    log(r.status === 200, name, `HTTP ${r.status}`);
  }

  for (const [name, path] of [
    ["H5 登录页", "/m/login"],
    ["H5 注册页", "/m/register"],
    ["我的订单", "/m/orders"],
    ["个人中心", "/m/me"],
  ]) {
    const r = await req("GET", path, { cookie: COOKIE_JAR.user });
    log(r.status === 200, name, `HTTP ${r.status}`);
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!project) {
    project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
    if (project) {
      const now = Date.now();
      await prisma.auctionProject.update({
        where: { id: project.id },
        data: {
          status: "LIVE",
          startsAt: new Date(now - 60_000),
          endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        },
      });
      project = await prisma.auctionProject.findUnique({ where: { id: project.id } });
      console.log("  (已刷新演示竞拍为 LIVE)");
    }
  }

  if (project) {
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const start = Number(project.startPrice);
    const step = Number(project.bidStep);
    let bidAmount = topBid ? Number(topBid.amount) + step : start;

    let bidRes = await req("POST", `/api/m/auction/${project.id}/bid`, {
      cookie: COOKIE_JAR.user,
      body: { amount: bidAmount },
    });
    if (bidRes.status !== 200 && bidRes.json?.error) {
      const m = String(bidRes.json.error).match(/(\d+(?:\.\d+)?)/);
      if (m) {
        bidAmount = parseFloat(m[1]);
        bidRes = await req("POST", `/api/m/auction/${project.id}/bid`, {
          cookie: COOKIE_JAR.user,
          body: { amount: bidAmount },
        });
      }
    }
    log(bidRes.status === 200 && bidRes.json?.ok, "竞拍出价", JSON.stringify(bidRes.json));
  } else {
    log(false, "竞拍出价", "无竞拍项目");
  }

  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const startDate = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 1);
    const endDate = d.toISOString().slice(0, 10);
    const dryRes = await req("POST", "/api/m/drying/reserve", {
      cookie: COOKIE_JAR.user,
      body: { listingId: listing.id, startDate, endDate },
    });
    log(dryRes.status === 200 && dryRes.json?.ok, "晒场预约", JSON.stringify(dryRes.json));
  } else {
    log(false, "晒场预约", "无运营晒场");
  }

  if (project) {
    const payRes = await req("POST", "/api/m/payments/mock", {
      cookie: COOKIE_JAR.user,
      body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id },
    });
    log(
      (payRes.status === 200 && payRes.json?.ok) || payRes.status === 409,
      "竞拍保证金支付",
      JSON.stringify(payRes.json),
    );
  }

  await prisma.$disconnect();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
