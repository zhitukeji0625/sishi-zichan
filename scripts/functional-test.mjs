#!/usr/bin/env node
/**
 * 功能完整性冒烟测试（需 dev server + MariaDB）
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

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

async function main() {
  const userJar = new Map();
  const adminJar = new Map();

  function cookieHeader(jar) {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  function storeCookies(jar, headers) {
    const set = headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  // --- Auth ---
  {
    const r = await jsonFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    storeCookies(userJar, r.headers);
    r.body?.ok ? pass("用户登录") : fail("用户登录", JSON.stringify(r.body));
  }

  {
    const r = await jsonFetch("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    storeCookies(adminJar, r.headers);
    r.body?.ok ? pass("管理员登录") : fail("管理员登录", JSON.stringify(r.body));
  }

  // --- Pages ---
  for (const [name, path] of [
    ["门户首页", "/"],
    ["H5 首页", "/m"],
    ["H5 竞拍列表", "/m/auction"],
    ["H5 晒场", "/m/drying"],
    ["H5 我的", "/m/me"],
    ["H5 订单", "/m/orders"],
    ["管理登录页", "/admin/login"],
    ["管理首页", "/admin"],
    ["管理资产", "/admin/assets"],
    ["管理竞拍", "/admin/auctions"],
    ["管理晒场", "/admin/drying"],
    ["管理报名", "/admin/registrations"],
    ["管理公告", "/admin/announcements"],
    ["管理审计", "/admin/audit"],
    ["管理配置", "/admin/config"],
    ["管理字典", "/admin/dict"],
    ["管理账号", "/admin/admins"],
    ["管理组织", "/admin/organizations"],
  ]) {
    const r = await fetch(`${BASE}${path}`, {
      headers: { Cookie: cookieHeader(path.startsWith("/admin") && path !== "/admin/login" ? adminJar : userJar) },
      redirect: "manual",
    });
    const ok = r.status >= 200 && r.status < 400;
    ok ? pass(`页面 ${name}`, String(r.status)) : fail(`页面 ${name}`, String(r.status));
  }

  // --- Third party ---
  {
    const r = await jsonFetch("/api/dev/third-party-token?u_id=func-test-001");
    const token = r.body?.token;
    if (!token) {
      fail("第三方 Token");
    } else {
      pass("第三方 Token");
      const sso = await jsonFetch("/api/auth/third-party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      sso.body?.ok ? pass("第三方 SSO") : fail("第三方 SSO", JSON.stringify(sso.body));
    }
  }

  // --- Dict data ---
  const dictCount = await prisma.dictCategory.count();
  dictCount >= 10 ? pass("数据字典已初始化", String(dictCount)) : fail("数据字典已初始化", String(dictCount));

  // --- LIVE auction (seed should ensure one) ---
  const liveProject = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  liveProject ? pass("存在 LIVE 竞拍", liveProject.id) : fail("存在 LIVE 竞拍", "无进行中项目");

  if (liveProject) {
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: liveProject.id },
      orderBy: { amount: "desc" },
    });
    const minBid = topBid
      ? Number(topBid.amount) + Number(liveProject.bidStep)
      : Number(liveProject.startPrice);
    const bid = await jsonFetch(`/api/m/auction/${liveProject.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
      body: JSON.stringify({ amount: String(minBid) }),
    });
    bid.body?.ok ? pass("竞拍出价") : fail("竞拍出价", JSON.stringify(bid.body));

    const detail = await fetch(`${BASE}/m/auction/${liveProject.id}`, {
      headers: { Cookie: cookieHeader(userJar) },
    });
    detail.status === 200 ? pass("竞拍详情页") : fail("竞拍详情页", String(detail.status));
  }

  // --- Drying reservation ---
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const res = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
      body: JSON.stringify({ listingId: listing.id, startDate: fmt(tomorrow), endDate: fmt(dayAfter) }),
    });
    res.body?.ok ? pass("晒场预约") : fail("晒场预约", JSON.stringify(res.body));

    const dryingPage = await fetch(`${BASE}/m/drying/${listing.id}`, {
      headers: { Cookie: cookieHeader(userJar) },
    });
    dryingPage.status === 200 ? pass("晒场详情页") : fail("晒场详情页", String(dryingPage.status));
  } else {
    fail("晒场预约", "无 OPERATING 晒场");
  }

  // --- Register ---
  {
    const phone = `139${String(Date.now()).slice(-8)}`;
    const r = await jsonFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password: "test1234", name: "冒烟测试" }),
    });
    r.body?.ok ? pass("用户注册") : fail("用户注册", JSON.stringify(r.body));
  }

  // --- Admin asset create ---
  {
    const org = await prisma.organization.findFirst({ where: { level: "COMPANY" } });
    if (org) {
      const fd = new FormData();
      fd.set("orgId", org.id);
      fd.set("type", "LAND");
      fd.set("name", `冒烟资产${Date.now()}`);
      fd.set("locationText", "测试地点");
      const r = await fetch(`${BASE}/api/admin/assets`, {
        method: "POST",
        headers: { Cookie: cookieHeader(adminJar) },
        body: fd,
      });
      const body = await r.json();
      body?.ok ? pass("管理端创建资产") : fail("管理端创建资产", JSON.stringify(body));
    }
  }

  // --- Logout ---
  {
    await jsonFetch("/api/auth/logout", { method: "POST", headers: { Cookie: cookieHeader(userJar) } });
    pass("用户登出");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- 结果: ${results.length - failed.length}/${results.length} 通过 ---`);
  if (failed.length) {
    console.error("失败项:", failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
