#!/usr/bin/env node
/**
 * API smoke tests — requires dev server on BASE_URL (default http://127.0.0.1:3000).
 */
const base = process.env.BASE_URL || "http://127.0.0.1:3000";

async function request(method, path, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text.slice(0, 200);
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, json, setCookie };
}

function mergeCookies(existing, setCookie) {
  const jar = new Map();
  for (const part of (existing || "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [k, v] = part.split("=");
    if (k) jar.set(k, v);
  }
  for (const line of setCookie) {
    const [pair] = line.split(";");
    const [k, v] = pair.split("=");
    if (k) jar.set(k.trim(), v);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  const failures = [];
  const check = (name, ok, detail) => {
    if (!ok) failures.push({ name, detail });
    else console.log("OK", name);
  };

  let r = await request("GET", "/");
  check("home", r.status === 200, r.status);

  r = await request("POST", "/api/auth/login", { body: { phone: "", password: "" } });
  check("login validation", r.status === 400, r);

  let adminCookie = "";
  r = await request("POST", "/api/auth/admin/login", {
    body: { phone: "13900000001", password: "admin123" },
  });
  adminCookie = mergeCookies(adminCookie, r.setCookie);
  check("admin login", r.status === 200 && r.json?.ok, r);

  let userCookie = "";
  r = await request("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
  });
  userCookie = mergeCookies(userCookie, r.setCookie);
  check("user login", r.status === 200 && r.json?.ok, r);

  r = await request("POST", "/api/upload", { body: {}, cookie: adminCookie });
  check("upload non-multipart", r.status === 400, r);

  r = await request("POST", "/api/admin/assets", { body: { orgId: "x" }, cookie: adminCookie });
  check("admin assets non-multipart", r.status === 400, r);

  r = await request("POST", "/api/m/payments/mock", {
    body: { purpose: "INVALID" },
    cookie: userCookie,
  });
  check("payment invalid purpose", r.status === 400, r);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  await prisma.$disconnect();

  check("live auction in db", !!live, "run npm run db:seed");
  if (live) {
    r = await request("POST", `/api/m/auction/${live.id}/bid`, {
      body: { amount: 999999 },
      cookie: userCookie,
    });
    check("bid endpoint", r.status < 500, r);
  }

  if (listing) {
    const start = new Date();
    start.setDate(start.getDate() + 90);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    r = await request("POST", "/api/m/drying/reserve", {
      body: {
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
      cookie: userCookie,
    });
    check("drying reserve", r.status === 200 || r.status === 400, r);
  }

  if (failures.length) {
    console.error("FAILURES:", JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  console.log("Smoke tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
