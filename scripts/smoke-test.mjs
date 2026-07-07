#!/usr/bin/env node
/**
 * 功能冒烟测试（生产模式 npm start）
 * 用法: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const results = [];
let cookieJar = "";

function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${name}${detail ? `: ${detail}` : ""}`);
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  if (cookieJar) headers.Cookie = cookieJar;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const part = c.split(";")[0];
    const name = part.split("=")[0];
    const rest = cookieJar
      .split("; ")
      .filter((x) => x && !x.startsWith(`${name}=`));
    rest.push(part);
    cookieJar = rest.join("; ");
  }
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // 1. 首页
  {
    const r = await req("/");
    log("GET /", r.status === 200, `status=${r.status}`);
  }

  // 2. 管理端登录页
  {
    const r = await req("/admin/login");
    log("GET /admin/login", r.status === 200, `status=${r.status}`);
  }

  // 3. 管理端登录
  {
    const r = await req("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    log("POST admin login", r.status === 200 && r.body?.ok, `status=${r.status}`);
  }

  // 4. 用户登录
  cookieJar = "";
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    log("POST user login", r.status === 200 && r.body?.ok, `status=${r.status}`);
  }

  // 5. 生产环境 dev token 404
  {
    const r = await req("/api/dev/third-party-token?u_id=test");
    log("GET dev third-party-token (prod=404)", r.status === 404, `status=${r.status}`);
  }

  // 6. 查找 LIVE 竞拍并出价
  {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    let live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
    const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
    let projectId = live?.id;
    if (!projectId) {
      const asset = await prisma.asset.findFirst();
      if (asset && user) {
        const p = await prisma.auctionProject.create({
          data: {
            code: `SMOKE${Date.now()}`,
            assetId: asset.id,
            startPrice: 1000,
            bidStep: 100,
            depositAmount: 100,
            startsAt: new Date(Date.now() - 60000),
            endsAt: new Date(Date.now() + 86400000),
            status: "LIVE",
          },
        });
        await prisma.auctionRegistration.upsert({
          where: { projectId_endUserId: { projectId: p.id, endUserId: user.id } },
          update: { status: "APPROVED", depositPaid: true },
          create: { projectId: p.id, endUserId: user.id, status: "APPROVED", depositPaid: true },
        });
        projectId = p.id;
        live = p;
        log("setup LIVE auction", true, projectId);
      }
    }
    if (projectId && live) {
      const top = await prisma.auctionBid.findFirst({
        where: { projectId },
        orderBy: { amount: "desc" },
      });
      const minBid = top
        ? Number(top.amount) + Number(live.bidStep)
        : Number(live.startPrice);
      const r = await req(`/api/m/auction/${projectId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: minBid }),
      });
      log("POST auction bid", r.status === 200 && r.body?.ok, `status=${r.status} ${r.body?.error ?? ""}`);
    } else {
      log("POST auction bid", false, "no LIVE project");
    }
    await prisma.$disconnect();
  }

  // 7. 晒场预约
  cookieJar = "";
  await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
    await prisma.$disconnect();
    if (listing) {
      const offset = 10 + Math.floor(Math.random() * 50);
      const start = new Date(Date.now() + offset * 86400000);
      const end = new Date(Date.now() + (offset + 2) * 86400000);
      const payload = {
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
      const r1 = await req("/api/m/drying/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      log("POST drying reserve", r1.status === 200 && r1.body?.ok, `status=${r1.status} ${r1.body?.error ?? ""}`);
      const r2 = await req("/api/m/drying/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      log(
        "POST drying reserve duplicate",
        r2.status === 409,
        `status=${r2.status} ${r2.body?.error ?? ""}`,
      );
    } else {
      log("POST drying reserve", false, "no listing");
    }
  }

  // 8. 保证金重复支付 409
  {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
    const reg = await prisma.auctionRegistration.findFirst({
      where: { endUserId: user?.id, depositPaid: true },
    });
    await prisma.$disconnect();
    if (reg) {
      const r = await req("/api/m/payments/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: reg.projectId }),
      });
      log("POST mock payment duplicate deposit", r.status === 409, `status=${r.status} ${r.body?.error ?? ""}`);
    } else {
      log("POST mock payment duplicate deposit", false, "no paid registration");
    }
  }

  // 9. 无效登录
  cookieJar = "";
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    log("POST user login wrong password", r.status === 401, `status=${r.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.error("Failed:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
