/**
 * 功能完整性冒烟测试：需已启动 dev server 且数据库已 seed。
 * 用法：BASE_URL=http://localhost:3000 npx tsx scripts/integration-test.ts
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

type Jar = Map<string, string>;

function parseSetCookie(header: string | null, jar: Jar) {
  if (!header) return;
  const part = header.split(";")[0]?.trim();
  if (!part) return;
  const eq = part.indexOf("=");
  if (eq < 0) return;
  jar.set(part.slice(0, eq), part.slice(eq + 1));
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchApi(
  path: string,
  opts: { method?: string; body?: unknown; jar?: Jar } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.jar?.size) headers.Cookie = cookieHeader(opts.jar);
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined || path.includes("/logout") ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (opts.jar) {
    for (const c of setCookie) parseSetCookie(c, opts.jar);
    const single = res.headers.get("set-cookie");
    if (single) parseSetCookie(single, opts.jar);
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`OK: ${msg}`);
}

async function pageStatus(path: string, jar?: Jar) {
  const headers: Record<string, string> = {};
  if (jar?.size) headers.Cookie = cookieHeader(jar);
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  return res.status;
}

async function main() {
  const adminJar: Jar = new Map();
  const userJar: Jar = new Map();

  const adminLogin = await fetchApi("/api/auth/admin/login", {
    body: { phone: "13900000001", password: "admin123" },
    jar: adminJar,
  });
  if (!adminLogin.json.ok) fail(`admin login: ${JSON.stringify(adminLogin.json)}`);
  ok("admin login");

  const userLogin = await fetchApi("/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
    jar: userJar,
  });
  if (!userLogin.json.ok) fail(`user login: ${JSON.stringify(userLogin.json)}`);
  ok("user login");

  for (const path of ["/", "/m", "/m/auction", "/m/drying", "/m/me", "/m/orders"]) {
    const st = await pageStatus(path, userJar);
    if (st !== 200) fail(`page ${path} -> ${st}`);
  }
  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying"]) {
    const st = await pageStatus(path, adminJar);
    if (st !== 200) fail(`page ${path} -> ${st}`);
  }
  ok("all key pages 200");

  const tokenRes = await fetchApi("/api/dev/third-party-token?u_id=integration-test");
  const token = tokenRes.json.token as string | undefined;
  if (!token) fail("third-party token missing");
  const ssoSt = await pageStatus(`/m/sso?token=${encodeURIComponent(token)}`);
  if (ssoSt !== 200) fail(`sso page -> ${ssoSt}`);
  ok("third-party token + sso page");

  const { PrismaClient } = await import("@prisma/client");
  const { Decimal } = await import("@prisma/client/runtime/library");
  const prisma = new PrismaClient();
  try {
    const proj = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (!proj) fail("no LIVE auction project");
    const top = proj.bids[0]?.amount;
    const minNext = top
      ? new Decimal(top.toString()).plus(proj.bidStep.toString())
      : new Decimal(proj.startPrice.toString());
    const bidAmt = Number(minNext.toString());
    const bidRes = await fetchApi(`/api/m/auction/${proj.id}/bid`, {
      body: { amount: bidAmt },
      jar: userJar,
    });
    if (!bidRes.json.ok) fail(`auction bid: ${JSON.stringify(bidRes.json)}`);
    ok(`auction bid at ${bidAmt}`);

    const listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
    if (!listing) fail("no operating drying listing");
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 3);
    const end = new Date();
    end.setUTCDate(end.getUTCDate() + 4);
    const reserveRes = await fetchApi("/api/m/drying/reserve", {
      body: {
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
      jar: userJar,
    });
    if (!reserveRes.json.ok) fail(`drying reserve: ${JSON.stringify(reserveRes.json)}`);
    ok("drying reserve");

    const logoutUser = await fetchApi("/api/auth/logout", { method: "POST", jar: userJar });
    if (logoutUser.status >= 400) fail("user logout");
    const logoutAdmin = await fetchApi("/api/auth/admin/logout", { method: "POST", jar: adminJar });
    if (logoutAdmin.status >= 400) fail("admin logout");
    ok("logout endpoints");
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n=== ALL INTEGRATION TESTS PASSED ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
