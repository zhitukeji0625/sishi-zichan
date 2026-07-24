#!/usr/bin/env node
/**
 * API smoke tests — run with dev server on BASE_URL (default http://localhost:3000).
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let fail = 0;
function ok(name) {
  console.log(`OK ${name}`);
}
function bad(name, detail) {
  console.error(`FAIL ${name}: ${detail}`);
  fail += 1;
}

async function json(path, init = {}, jar) {
  const headers = { ...(init.headers ?? {}) };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const part = c.split(";")[0];
    if (part) jar.cookies.set(part.split("=")[0], part);
  }
  const cookieHeader = [...jar.cookies.entries()].map(([k, v]) => `${k}=${v.split("=")[1] ?? v}`).join("; ");
  if (cookieHeader && !init.headers?.cookie) {
    // re-fetch not needed; cookies applied on next call via jar
  }
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, jar: { cookies: jar.cookies, header: cookieHeader } };
}

function cookieJar() {
  const cookies = new Map();
  return {
    cookies,
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    absorb(res) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const i = pair.indexOf("=");
        if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
    },
  };
}

async function fetchWithJar(path, init, jar) {
  const headers = { ...(init.headers ?? {}) };
  const h = jar.header();
  if (h) headers.cookie = h;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  jar.absorb(res);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function main() {
  const userJar = cookieJar();
  const adminJar = cookieJar();

  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    if (res.status === 200) ok(`GET ${path}`);
    else bad(`GET ${path}`, String(res.status));
  }

  let r = await fetchWithJar(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ phone: "13800138000", password: "user123" }) },
    userJar,
  );
  if (r.body?.ok) ok("user login");
  else bad("user login", JSON.stringify(r.body));

  r = await fetchWithJar(
    "/api/auth/admin/login",
    { method: "POST", body: JSON.stringify({ phone: "13900000001", password: "admin123" }) },
    adminJar,
  );
  if (r.body?.ok) ok("admin login");
  else bad("admin login", JSON.stringify(r.body));

  for (const ep of ["upload", "admin/assets"]) {
    r = await fetchWithJar(
      `/api/${ep}`,
      { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } },
      adminJar,
    );
    if (r.res.status === 400) ok(`POST /api/${ep} non-multipart`);
    else bad(`POST /api/${ep} non-multipart`, String(r.res.status));
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  const listing = await prisma.dryingFieldListing.findFirst();
  await prisma.$disconnect();

  if (!project) bad("auction project", "missing");
  else {
    if (project.status === "LIVE") ok("auction LIVE");
    else bad("auction LIVE", project.status);
    const top = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const minBid = top
      ? Number(top.amount) + Number(project.bidStep)
      : Number(project.startPrice);
    r = await fetchWithJar(
      `/api/m/auction/${project.id}/bid`,
      { method: "POST", body: JSON.stringify({ amount: minBid }) },
      userJar,
    );
    if (r.body?.ok) ok("bid");
    else bad("bid", JSON.stringify(r.body));

    r = await fetchWithJar(
      "/api/m/payments/mock",
      {
        method: "POST",
        body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
      },
      userJar,
    );
    if (r.res.status === 409) ok("deposit duplicate 409");
    else bad("deposit duplicate 409", String(r.res.status));
  }

  if (listing) {
    const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
    let start = "";
    let end = "";
    for (let i = 90; i < 400; i++) {
      const base = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      start = base.toISOString().slice(0, 10);
      end = new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (!demoUser) break;
      const clash = await prisma.dryingReservation.findFirst({
        where: {
          listingId: listing.id,
          endUserId: demoUser.id,
          status: { notIn: ["REJECTED", "CANCELLED"] },
          startDate: { lte: new Date(end) },
          endDate: { gte: new Date(start) },
        },
      });
      if (!clash) break;
    }
    r = await fetchWithJar(
      "/api/m/drying/reserve",
      {
        method: "POST",
        body: JSON.stringify({ listingId: listing.id, startDate: start, endDate: end }),
      },
      userJar,
    );
    if (r.body?.ok) ok("drying reserve");
    else bad("drying reserve", JSON.stringify(r.body));

    r = await fetchWithJar(
      "/api/m/drying/reserve",
      {
        method: "POST",
        body: JSON.stringify({ listingId: listing.id, startDate: start, endDate: end }),
      },
      userJar,
    );
    if (r.res.status === 409) ok("drying overlap 409");
    else bad("drying overlap 409", `${r.res.status} ${JSON.stringify(r.body)}`);
  }

  r = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke`);
  const tokBody = await r.json();
  if (tokBody.token) ok("dev third-party token");
  else bad("dev third-party token", "no token");

  console.log(fail ? `\n${fail} failure(s)` : "\nAll smoke checks passed.");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
