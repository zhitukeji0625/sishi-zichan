#!/usr/bin/env node
/**
 * HTTP smoke tests against a running server (npm start on :3000).
 * Run: npm run db:seed && npm run build && npm start & npm run smoke
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const IS_PROD = process.env.NODE_ENV === "production";

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`✓ ${name}`);
    pass++;
  } else {
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
    fail++;
  }
}

async function req(method, path, { body, cookies, expectStatus } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, json, text, setCookie };
}

function mergeCookies(existing, setCookie) {
  const jar = new Map();
  for (const part of (existing ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [k, ...v] = part.split("=");
    if (k) jar.set(k, v.join("="));
  }
  for (const sc of setCookie) {
    const [pair] = sc.split(";");
    const [k, ...v] = pair.split("=");
    if (k) jar.set(k.trim(), v.join("=").trim());
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  console.log(`Smoke tests -> ${BASE} (NODE_ENV=${process.env.NODE_ENV ?? "undefined"})\n`);

  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const res = await req("GET", path);
    check(`GET ${path}`, res.status === 200, `status ${res.status}`);
  }

  // Admin login + pages
  let adminCookies = "";
  {
    const res = await req("POST", "/api/auth/admin/login", {
      body: { phone: "13900000001", password: "admin123" },
    });
    adminCookies = mergeCookies(adminCookies, res.setCookie);
    check("admin login", res.json?.ok === true, res.text);
    for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying", "/admin/dict"]) {
      const page = await req("GET", path, { cookies: adminCookies });
      check(`GET ${path} (auth)`, page.status === 200, `status ${page.status}`);
    }
  }

  // User login
  let userCookies = "";
  {
    const res = await req("POST", "/api/auth/login", {
      body: { phone: "13800138000", password: "user123" },
    });
    userCookies = mergeCookies(userCookies, res.setCookie);
    check("user login", res.json?.ok === true, res.text);
  }

  // Third-party token (dev only)
  {
    const res = await req("GET", "/api/dev/third-party-token?u_id=smoke_user");
    if (IS_PROD) {
      check("third-party token disabled in prod", res.status === 404, res.text);
    } else {
      check("third-party token", typeof res.json?.token === "string", res.text);
      if (res.json?.token) {
        const sso = await req("POST", "/api/auth/third-party", {
          body: { token: res.json.token },
        });
        check("third-party login", sso.json?.ok === true, sso.text);
      }
    }
  }

  // Auction bid
  let projectId = "";
  {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    const proj = await p.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { startsAt: "desc" },
    });
    projectId = proj?.id ?? "";
    await p.$disconnect();
    const topBid = projectId
      ? await (async () => {
          const p2 = new PrismaClient();
          const bid = await p2.auctionBid.findFirst({
            where: { projectId },
            orderBy: { amount: "desc" },
          });
          const project = await p2.auctionProject.findUnique({ where: { id: projectId } });
          await p2.$disconnect();
          const base = bid ? Number(bid.amount) : Number(project?.startPrice ?? 8000);
          const step = Number(project?.bidStep ?? 200);
          return base + step;
        })()
      : 8200;
    const bid = await req("POST", `/api/m/auction/${projectId}/bid`, {
      cookies: userCookies,
      body: { amount: topBid },
    });
    check("auction bid", bid.json?.ok === true, bid.text);
  }

  // Drying reserve + overlap 409
  let listingId = "";
  {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    listingId = (await p.dryingFieldListing.findFirst())?.id ?? "";
    await p.$disconnect();
    const dayOffset = 10 + (Date.now() % 20);
    const start = new Date(Date.now() + dayOffset * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + (dayOffset + 1) * 86400000).toISOString().slice(0, 10);
    const first = await req("POST", "/api/m/drying/reserve", {
      cookies: userCookies,
      body: { listingId, startDate: start, endDate: end },
    });
    check("drying reserve", first.json?.ok === true, first.text);
    const dup = await req("POST", "/api/m/drying/reserve", {
      cookies: userCookies,
      body: { listingId, startDate: start, endDate: end },
    });
    check("drying overlap -> 409", dup.status === 409, dup.text);
  }

  // Upload without auth
  {
    const res = await fetch(`${BASE}/api/upload`, { method: "POST" });
    check("upload without auth -> 401", res.status === 401);
  }

  // Register validation
  {
    const res = await req("POST", "/api/auth/register", { body: {} });
    check("register empty -> error", res.json?.error != null, res.text);
  }

  // Logout
  {
    const res = await req("POST", "/api/auth/logout", { cookies: userCookies });
    check("user logout", res.json?.ok === true || res.status === 200, res.text);
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
