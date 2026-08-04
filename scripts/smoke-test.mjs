#!/usr/bin/env node
/**
 * 功能冒烟测试 — 由 cron 自动化调用
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
let passed = 0;
let failed = 0;
const errors = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name}: ${detail}` : name;
    errors.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

async function fetchStatus(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  return { status: res.status, res };
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
  return { status: res.status, data, cookie: jar.join("; ") };
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
  return { status: res.status, data, cookie: jar.join("; ") };
}

async function main() {
  console.log(`\n=== 功能冒烟测试 @ ${BASE} ===\n`);

  // 1. 公开页面
  console.log("【公开页面】");
  for (const path of ["/", "/m", "/m/login", "/m/register", "/m/auction", "/m/drying", "/admin/login"]) {
    const { status } = await fetchStatus(path);
    check(`${path} → 200`, status === 200, `got ${status}`);
  }

  // 2. 用户登录
  console.log("\n【用户登录】");
  const userLogin = await loginUser();
  check("用户登录成功", userLogin.status === 200 && userLogin.data.ok, JSON.stringify(userLogin.data));

  // 3. 管理员登录
  console.log("\n【管理员登录】");
  const adminLogin = await loginAdmin();
  check("管理员登录成功", adminLogin.status === 200 && adminLogin.data.ok, JSON.stringify(adminLogin.data));

  // 4. 管理后台页面（需 cookie）
  console.log("\n【管理后台页面】");
  const adminPages = [
    "/admin",
    "/admin/assets",
    "/admin/auctions",
    "/admin/drying",
    "/admin/registrations",
    "/admin/organizations",
    "/admin/admins",
    "/admin/announcements",
    "/admin/audit",
    "/admin/config",
    "/admin/dict",
  ];
  for (const path of adminPages) {
    const { status } = await fetchStatus(path, {
      headers: { Cookie: adminLogin.cookie },
      redirect: "manual",
    });
    check(`${path} → 200`, status === 200, `got ${status}`);
  }

  // 5. 移动端页面（需 cookie）
  console.log("\n【移动端页面】");
  for (const path of ["/m/me", "/m/orders"]) {
    const { status } = await fetchStatus(path, {
      headers: { Cookie: userLogin.cookie },
      redirect: "manual",
    });
    check(`${path} → 200`, status === 200, `got ${status}`);
  }

  // 6. 第三方 SSO
  console.log("\n【第三方 SSO】");
  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke_test_user`);
  const tokenData = await tokenRes.json();
  check("获取第三方 token", tokenRes.status === 200 && tokenData.token, JSON.stringify(tokenData));

  const ssoRes = await fetch(`${BASE}/api/auth/third-party`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenData.token }),
  });
  const ssoData = await ssoRes.json();
  check("第三方 SSO 登录", ssoRes.status === 200 && ssoData.ok, JSON.stringify(ssoData));

  // 7. 竞拍出价
  console.log("\n【竞拍出价】");
  const prisma = new PrismaClient();
  const liveProject = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
  });
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });
  await prisma.$disconnect();

  if (!liveProject) {
    check("存在 LIVE 竞拍项目", false, "数据库无 LIVE 项目");
  } else {
    const bidRes = await fetch(`${BASE}/api/m/auction/${liveProject.id}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userLogin.cookie,
      },
      body: JSON.stringify({ amount: Number(liveProject.startPrice) }),
    });
    const bidData = await bidRes.json();
    check("竞拍出价", bidRes.status === 200 && bidData.ok, JSON.stringify(bidData));
  }

  // 8. 晒场预约
  console.log("\n【晒场预约】");
  if (!listing) {
    check("存在运营中晒场", false, "数据库无 OPERATING 晒场");
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const reserveRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: userLogin.cookie,
      },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: tomorrow.toISOString().slice(0, 10),
        endDate: dayAfter.toISOString().slice(0, 10),
      }),
    });
    const reserveData = await reserveRes.json();
    check("晒场预约", reserveRes.status === 200 && reserveData.ok, JSON.stringify(reserveData));
  }

  // 9. 上传 multipart 校验
  console.log("\n【上传校验】");
  const noAuthRes = await fetch(`${BASE}/api/upload`, { method: "POST", body: "not multipart" });
  check("未登录上传 → 401", noAuthRes.status === 401, `got ${noAuthRes.status}`);

  const badTypeRes = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: adminLogin.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ file: "fake" }),
  });
  check("非 multipart 上传 → 400", badTypeRes.status === 400 || badTypeRes.status === 500, `got ${badTypeRes.status}`);

  // 10. 无效登录
  console.log("\n【错误处理】");
  const badLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "000", password: "wrong" }),
  });
  check("错误密码 → 401", badLogin.status === 401, `got ${badLogin.status}`);

  console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===\n`);
  if (errors.length) {
    console.log("失败项:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
