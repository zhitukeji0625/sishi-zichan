#!/usr/bin/env node
/**
 * Functional smoke tests against a running dev server (default http://localhost:3000).
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    console.log(`PASS ${name}`);
    pass++;
  } else {
    console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

async function fetchCode(url, init) {
  const res = await fetch(url, init);
  return { code: res.status, res };
}

async function login(path, body) {
  const jar = {};
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  const json = await res.json().catch(() => ({}));
  const cookie = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return { code: res.status, json, cookie };
}

function cookieInit(cookie) {
  return cookie ? { headers: { Cookie: cookie } } : {};
}

async function main() {
  const pages = [
    ["/", "portal"],
    ["/m", "m-home"],
    ["/m/login", "m-login"],
    ["/m/register", "m-register"],
    ["/m/auction", "m-auction"],
    ["/m/drying", "m-drying"],
    ["/admin/login", "admin-login"],
  ];
  for (const [path, name] of pages) {
    const { code } = await fetchCode(`${BASE}${path}`);
    ok(name, code === 200, `got ${code}`);
  }

  const user = await login("/api/auth/login", { phone: "13800138000", password: "user123" });
  ok("user-login", user.code === 200 && user.json.ok === true, JSON.stringify(user.json));

  const admin = await login("/api/auth/admin/login", { phone: "13900000001", password: "admin123" });
  ok("admin-login", admin.code === 200 && admin.json.ok === true, JSON.stringify(admin.json));

  const protectedPaths = [
    ["/m/me", user.cookie],
    ["/m/orders", user.cookie],
    ["/admin", admin.cookie],
    ["/admin/assets", admin.cookie],
    ["/admin/auctions", admin.cookie],
    ["/admin/drying", admin.cookie],
    ["/admin/dict", admin.cookie],
    ["/admin/config", admin.cookie],
    ["/admin/organizations", admin.cookie],
    ["/admin/registrations", admin.cookie],
    ["/admin/audit", admin.cookie],
    ["/admin/admins", admin.cookie],
    ["/admin/announcements", admin.cookie],
  ];
  for (const [path, cookie] of protectedPaths) {
    const { code } = await fetchCode(`${BASE}${path}`, cookieInit(cookie));
    ok(`page ${path}`, code === 200, `got ${code}`);
  }

  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke-user`);
  const tokenJson = await tokenRes.json().catch(() => ({}));
  const sso = await fetchCode(`${BASE}/m/sso?token=${encodeURIComponent(tokenJson.token ?? "")}`);
  ok("sso", [200, 302, 307].includes(sso.code), `got ${sso.code}`);

  const noAuthUpload = await fetchCode(`${BASE}/api/upload`, { method: "POST" });
  ok("upload-no-auth", noAuthUpload.code === 401, `got ${noAuthUpload.code}`);

  const badTypeUpload = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { ...cookieInit(admin.cookie).headers, "Content-Type": "application/json" },
    body: "{}",
  });
  ok("upload-bad-content-type", badTypeUpload.status === 400, `got ${badTypeUpload.status}`);

  const fd = new FormData();
  fd.append("file", new Blob(["x"], { type: "text/plain" }), "test.txt");
  const invalidFile = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: cookieInit(admin.cookie).headers,
    body: fd,
  });
  ok("upload-invalid-type", invalidFile.status === 400, `got ${invalidFile.status}`);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const auction = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  const drying = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  const ann = await prisma.announcement.findFirst();
  const dictCount = await prisma.dictCategory.count();

  ok("dict-seeded", dictCount > 0, `categories=${dictCount}`);
  ok("live-auction", !!auction, "no LIVE auction");

  if (auction) {
    const top = await prisma.auctionBid.findFirst({
      where: { projectId: auction.id },
      orderBy: { amount: "desc" },
    });
    const minBid = top
      ? Number(top.amount) + Number(auction.bidStep)
      : Number(auction.startPrice);
    const bid = await fetch(`${BASE}/api/m/auction/${auction.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieInit(user.cookie).headers },
      body: JSON.stringify({ amount: minBid }),
    });
    const bidJson = await bid.json().catch(() => ({}));
    ok("auction-bid", bid.ok, JSON.stringify(bidJson));
    const detail = await fetchCode(`${BASE}/m/auction/${auction.id}`);
    ok("auction-detail", detail.code === 200, `got ${detail.code}`);
  }

  if (drying) {
    const offset = Math.floor(Math.random() * 20) + 10;
    const start = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + (offset + 1) * 86400000).toISOString().slice(0, 10);
    const reserve = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieInit(user.cookie).headers },
      body: JSON.stringify({ listingId: drying.id, startDate: start, endDate: end }),
    });
    ok("drying-reserve", reserve.ok, `status ${reserve.status}`);
    const dup = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieInit(user.cookie).headers },
      body: JSON.stringify({ listingId: drying.id, startDate: start, endDate: end }),
    });
    ok("drying-reserve-dup", dup.status === 409, `got ${dup.status}`);
    const detail = await fetchCode(`${BASE}/m/drying/${drying.id}`);
    ok("drying-detail", detail.code === 200, `got ${detail.code}`);
  }

  if (ann) {
    const detail = await fetchCode(`${BASE}/m/announcements/${ann.id}`);
    ok("announcement-detail", detail.code === 200, `got ${detail.code}`);
  }

  await prisma.$disconnect();

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
