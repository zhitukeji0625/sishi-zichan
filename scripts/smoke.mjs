#!/usr/bin/env node
/**
 * API smoke test — run against a live dev/prod server.
 * Usage: BASE_URL=http://localhost:3000 node scripts/smoke.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, detail);
  }
}

async function loginUser() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookie = (res.headers.getSetCookie?.() || []).join("; ");
  return { res, cookie };
}

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookie = (res.headers.getSetCookie?.() || []).join("; ");
  return { res, cookie };
}

const fmt = (d) => d.toISOString().slice(0, 10);

(async () => {
  ok("homepage 200", (await fetch(BASE)).status === 200);

  const admin = await loginAdmin();
  ok("admin login", admin.res.ok);

  const user = await loginUser();
  ok("user login", user.res.ok);

  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  const live = await p.auctionProject.findFirst({ where: { status: "LIVE" } });
  ok("live auction exists", !!live);
  const listing = await p.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });

  if (live) {
    const top = await p.auctionBid.findFirst({
      where: { projectId: live.id },
      orderBy: { amount: "desc" },
    });
    const minBid = top ? Number(top.amount) + Number(live.bidStep) : Number(live.startPrice);
    const bidRes = await fetch(`${BASE}/api/m/auction/${live.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: user.cookie },
      body: JSON.stringify({ amount: minBid }),
    });
    ok("place bid", bidRes.ok, await bidRes.text());

    const badBid = await fetch(`${BASE}/api/m/auction/${live.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: user.cookie },
      body: JSON.stringify({ amount: "" }),
    });
    ok("reject invalid bid amount", badBid.status === 400);
  }

  if (listing) {
    const start = new Date();
    start.setDate(start.getDate() + 4);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const r1 = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: user.cookie },
      body: JSON.stringify({ listingId: listing.id, startDate: fmt(start), endDate: fmt(end) }),
    });
    ok("drying reserve", r1.ok, await r1.text());

    const r2 = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: user.cookie },
      body: JSON.stringify({ listingId: listing.id, startDate: fmt(start), endDate: fmt(end) }),
    });
    ok("reject overlapping drying reserve", r2.status === 400, await r2.text());
  }

  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke_${Date.now()}`);
  const tokenJ = await tokenRes.json();
  if (tokenJ.token) {
    const sso = await fetch(`${BASE}/api/auth/third-party`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenJ.token }),
    });
    ok("SSO login", sso.ok);
  }

  const up1 = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { cookie: admin.cookie } });
  ok("upload reject no file", up1.status === 400);

  const fd = new FormData();
  fd.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt");
  const up2 = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { cookie: admin.cookie }, body: fd });
  ok("upload reject bad type", up2.status === 400);

  await p.$disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
