#!/usr/bin/env node
/**
 * API smoke tests — requires `npm start` (production) on BASE_URL.
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0;
let fail = 0;

function assert(name, ok, detail = "") {
  if (ok) {
    console.log(`✓ ${name}`);
    pass++;
  } else {
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
    fail++;
  }
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: opts.redirect ?? "follow",
    ...opts,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { res, text, json };
}

const jar = new Map();

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const [k, v] = pair.split("=");
    jar.set(k.trim(), v);
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  // Pages
  {
    const { res } = await req("/");
    assert("GET /", res.status === 200);
  }
  {
    const { res } = await req("/admin", { redirect: "manual" });
    assert("GET /admin redirect", [302, 307, 308].includes(res.status));
  }
  {
    const { res } = await req("/m");
    assert("GET /m", res.status === 200);
  }
  {
    const { res } = await req("/admin/login");
    assert("GET /admin/login", res.status === 200);
  }

  // Auth
  {
    const { res } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "", password: "" }),
    });
    assert("POST login empty", res.status === 400);
  }
  {
    const { res } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    assert("POST login wrong pwd", res.status === 401);
  }
  {
    const { res } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    storeCookies(res);
    assert("POST login success", res.status === 200);
  }
  {
    const { res } = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert("POST drying no auth", res.status === 401);
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const listing = await prisma.dryingFieldListing.findFirst();
  assert("drying listing exists", !!listing);
  let project = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  assert("LIVE auction exists", !!project);

  const dayOffset = (Math.floor(Date.now() / 86400000) % 300) + 30;
  const start = new Date();
  start.setDate(start.getDate() + dayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  const fmt = (d) => d.toISOString().slice(0, 10);

  if (listing) {
    {
      const { res } = await req("/api/m/drying/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
        body: JSON.stringify({
          listingId: listing.id,
          startDate: fmt(start),
          endDate: fmt(end),
        }),
      });
      assert("POST drying reserve", res.status === 200);
    }
    {
      const { res, json } = await req("/api/m/drying/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
        body: JSON.stringify({
          listingId: listing.id,
          startDate: fmt(start),
          endDate: fmt(end),
        }),
      });
      assert(
        "POST drying duplicate",
        res.status === 409 && json?.error === "您在该时段已有预约",
        `status=${res.status}`,
      );
    }
  }

  if (project) {
    {
      const { res } = await req(`/api/m/auction/${project.id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
        body: JSON.stringify({ amount: -1 }),
      });
      assert("POST bid invalid", res.status === 400);
    }
    const top = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const minNext = top
      ? Number(top.amount) + Number(project.bidStep)
      : Number(project.startPrice);
    {
      const { res } = await req(`/api/m/auction/${project.id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
        body: JSON.stringify({ amount: minNext }),
      });
      assert("POST bid success", res.status === 200);
    }
    {
      const { res } = await req("/api/m/payments/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
        body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
      });
      assert("POST payment deposit paid", res.status === 409);
    }
  }

  const adminJar = new Map();
  {
    const { res } = await req("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const [k, v] = pair.split("=");
      adminJar.set(k.trim(), v);
    }
    assert("POST admin login", res.status === 200);
  }
  const adminCookie = [...adminJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  {
    const { res } = await req("/api/upload", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: new FormData(),
    });
    assert("POST upload no file", res.status === 400);
  }
  {
    const { res } = await req("/api/dev/third-party-token?u_id=test");
    assert("GET third-party-token prod 404", res.status === 404);
  }
  {
    const { res } = await req("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    assert("POST register duplicate", res.status === 409);
  }

  await prisma.$disconnect();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
