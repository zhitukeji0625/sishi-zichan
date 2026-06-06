#!/usr/bin/env node
/**
 * Smoke test for core HTTP routes and APIs.
 * Usage: node scripts/smoke-test.mjs
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const COOKIE_JAR = new Map();

function parseSetCookie(headers) {
  const raw = headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) COOKIE_JAR.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const cookies = [...COOKIE_JAR.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  parseSetCookie(res.headers);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text: text.slice(0, 200) };
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark} ${name}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  // Public pages
  for (const path of ["/", "/admin/login", "/m", "/m/login", "/m/auction", "/m/drying"]) {
    const r = await req("GET", path);
    check(`GET ${path}`, r.status === 200, `status=${r.status}`);
  }

  // Admin login
  const adminLogin = await req("POST", "/api/auth/admin/login", {
    phone: "13900000001",
    password: "admin123",
  });
  check("Admin login", adminLogin.status === 200 && adminLogin.json?.ok, JSON.stringify(adminLogin.json));

  // Admin protected page
  const adminHome = await req("GET", "/admin");
  check("Admin dashboard (authenticated)", adminHome.status === 200, `status=${adminHome.status}`);

  // Admin logout
  await req("POST", "/api/auth/admin/logout");

  // End user login
  const userLogin = await req("POST", "/api/auth/login", {
    phone: "13800138000",
    password: "user123",
  });
  check("User login", userLogin.status === 200 && userLogin.json?.ok, JSON.stringify(userLogin.json));

  // Dev third-party token
  const tp = await req("GET", "/api/dev/third-party-token?u_id=ext001");
  check("Dev third-party token", tp.status === 200 && tp.json?.token, JSON.stringify(tp.json));

  // Third-party SSO auth
  if (tp.json?.token) {
    const sso = await req("POST", "/api/auth/third-party", { token: tp.json.token });
    check("Third-party auth", sso.status === 200 && sso.json?.ok, JSON.stringify(sso.json));
  }

  // Re-login as demo user for mobile APIs
  COOKIE_JAR.clear();
  await req("POST", "/api/auth/login", { phone: "13800138000", password: "user123" });

  // Query DB for IDs via a small inline fetch won't work - use env or hardcode from query
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });

  if (project?.status !== "LIVE") {
    project = await prisma.auctionProject.update({
      where: { id: project.id },
      data: {
        status: "LIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    check("Reset auction project to LIVE", true, project.id);
  }

  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const minAmount = topBid
    ? Number(topBid.amount) + Number(project.bidStep)
    : Number(project.startPrice);
  const bid = await req("POST", `/api/m/auction/${project.id}/bid`, { amount: minAmount });
  check("Place bid", bid.status === 200 && bid.json?.ok, JSON.stringify(bid.json));

  if (listing) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const reserve = await req("POST", "/api/m/drying/reserve", {
      listingId: listing.id,
      startDate: tomorrow.toISOString().slice(0, 10),
      endDate: dayAfter.toISOString().slice(0, 10),
    });
    check("Drying reserve", reserve.status === 200 && reserve.json?.ok, JSON.stringify(reserve.json));
  }

  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
