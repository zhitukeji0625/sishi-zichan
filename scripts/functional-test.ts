/**
 * 功能完整性测试脚本 — 仅用于本地/CI 验证，不纳入生产构建。
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓ ${name}`);
    pass++;
  } else {
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
    fail++;
  }
}

async function fetchJson(
  path: string,
  init?: RequestInit & { jar?: Map<string, string> },
) {
  const jar = init?.jar;
  const headers = new Headers(init?.headers);
  if (jar?.size) {
    headers.set("Cookie", [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "));
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0 && jar) {
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function main() {
  const userJar = new Map<string, string>();
  const adminJar = new Map<string, string>();

  // --- 页面 ---
  for (const [name, path] of [
    ["门户首页", "/"],
    ["管理登录", "/admin/login"],
    ["H5首页", "/m"],
    ["竞拍列表", "/m/auction"],
    ["晒场列表", "/m/drying"],
  ] as const) {
    const r = await fetch(`${BASE}${path}`);
    check(name, r.status === 200, `HTTP ${r.status}`);
  }

  // --- 登录 ---
  const adminLogin = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    jar: adminJar,
  });
  check("师级管理员登录", adminLogin.res.status === 200 && adminLogin.body.ok);

  const userLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    jar: userJar,
  });
  check("承租用户登录", userLogin.res.status === 200 && userLogin.body.ok);

  // --- 管理端页面 ---
  for (const [name, path] of [
    ["管理首页", "/admin"],
    ["资产管理", "/admin/assets"],
    ["竞拍管理", "/admin/auctions"],
    ["晒场管理", "/admin/drying"],
    ["报名审核", "/admin/registrations"],
    ["公告管理", "/admin/announcements"],
  ] as const) {
    const r = await fetch(`${BASE}${path}`, {
      headers: { Cookie: [...adminJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    check(name, r.status === 200, `HTTP ${r.status}`);
  }

  // --- 创建 LIVE 竞拍用于测试 ---
  const asset = await prisma.asset.findFirst({ where: { status: "IDLE" } });
  if (!asset) {
    check("创建测试竞拍", false, "无空闲资产");
  } else {
    const project = await prisma.auctionProject.create({
      data: {
        code: `TEST${Date.now()}`,
        assetId: asset.id,
        startPrice: new Decimal(1000),
        bidStep: new Decimal(100),
        depositAmount: new Decimal(50),
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000),
        status: "LIVE",
      },
    });
    const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
    if (demoUser) {
      await prisma.auctionRegistration.create({
        data: {
          projectId: project.id,
          endUserId: demoUser.id,
          status: "APPROVED",
          depositPaid: true,
        },
      });
    }

    const detail = await fetch(`${BASE}/m/auction/${project.id}`);
    check("竞拍详情页", detail.status === 200);

    const bid = await fetchJson(`/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "1000" }),
      jar: userJar,
    });
    check("用户出价", bid.res.status === 200 && bid.body.ok !== false, JSON.stringify(bid.body));

    const bid2 = await fetchJson(`/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "1050" }),
      jar: userJar,
    });
    check("出价低于加价幅度应拒绝", bid2.res.status !== 200 || bid2.body.error);

    // cleanup
    await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
    await prisma.auctionRegistration.deleteMany({ where: { projectId: project.id } });
    await prisma.auctionProject.delete({ where: { id: project.id } });
  }

  // --- 晒场预约 ---
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const reserve = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: "2026-06-22",
        endDate: "2026-06-23",
      }),
      jar: userJar,
    });
    check("晒场预约", reserve.res.status === 200 && reserve.body.ok, JSON.stringify(reserve.body));

    if (reserve.body.id) {
      await prisma.dryingReservation.update({
        where: { id: reserve.body.id },
        data: { status: "APPROVED" },
      });

      const pay = await fetchJson("/api/m/payments/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "DRYING_DEPOSIT", reservationId: reserve.body.id }),
        jar: userJar,
      });
      check("晒场保证金支付", pay.res.status === 200 && pay.body.ok, JSON.stringify(pay.body));

      await prisma.payment.deleteMany({ where: { reservationId: reserve.body.id } });
      await prisma.dryingReservation.delete({ where: { id: reserve.body.id } });
    }
  }

  // --- 注册 ---
  const phone = `199${Date.now().toString().slice(-8)}`;
  const reg = await fetchJson("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: "test1234", name: "自动化测试" }),
  });
  check("新用户注册", reg.res.status === 200 && reg.body.ok);
  if (reg.body.userId) {
    await prisma.endUser.delete({ where: { id: reg.body.userId } }).catch(() => {});
  }

  // --- 第三方 Token ---
  const tp = await fetchJson("/api/dev/third-party-token?u_id=auto-test");
  check("第三方Token", tp.res.status === 200 && tp.body.token);

  // --- 登出 ---
  const logout = await fetchJson("/api/auth/logout", { method: "POST", jar: userJar });
  check("用户登出", logout.res.status === 200);

  console.log(`\n==============================`);
  console.log(`通过: ${pass}, 失败: ${fail}`);
  console.log(`==============================`);

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
