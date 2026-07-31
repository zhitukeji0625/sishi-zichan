#!/usr/bin/env node
/**
 * 冒烟测试：需已启动服务（npm start 或 npm run dev）且数据库已 seed。
 * 用法：node scripts/smoke.mjs [baseUrl]
 */
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { readFileSync } from "fs";
import { resolve } from "path";

const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
let pass = 0;
let fail = 0;

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* no .env */
  }
}

async function check(name, expectCode, url, opts = {}) {
  const { method = "GET", body, jar } = opts;
  const res = await fetch(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(jar?.cookie ? { Cookie: jar.cookie } : {}),
    },
  });
  const text = await res.text();
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (jar && setCookie.length) {
    jar.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }
  if (String(res.status) === String(expectCode)) {
    console.log(`✓ ${name} (${res.status})`);
    pass++;
    return text;
  }
  console.log(`✗ ${name} expected ${expectCode} got ${res.status}: ${text.slice(0, 200)}`);
  fail++;
  return text;
}

class CookieJar {
  cookie = "";
}

async function signThirdPartyToken(uid) {
  const secret = process.env.THIRD_PARTY_JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error("THIRD_PARTY_JWT_SECRET missing");
  return new SignJWT({ sub: uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("600s")
    .sign(new TextEncoder().encode(secret));
}

async function main() {
  loadEnv();
  const userJar = new CookieJar();
  const adminJar = new CookieJar();

  await check("GET /", 200, `${BASE}/`);
  await check("GET /m", 200, `${BASE}/m`);
  await check("GET /m/login", 200, `${BASE}/m/login`);
  await check("GET /admin/login", 200, `${BASE}/admin/login`);
  await check("GET /m/auction", 200, `${BASE}/m/auction`);
  await check("GET /m/drying", 200, `${BASE}/m/drying`);

  const devRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke-sso`);
  if (devRes.status === 200) {
    const data = JSON.parse(await devRes.text());
    if (data.token) {
      console.log("✓ dev third-party token (200)");
      pass++;
    } else {
      console.log("✗ dev third-party token: no token in response");
      fail++;
    }
  } else if (devRes.status === 404) {
    const token = await signThirdPartyToken("smoke-sso-user");
    await check("third-party SSO login", 200, `${BASE}/api/auth/third-party`, {
      method: "POST",
      body: { token },
      jar: userJar,
    });
  } else {
    console.log(`✗ dev third-party token unexpected ${devRes.status}`);
    fail++;
  }

  await check("user login", 200, `${BASE}/api/auth/login`, {
    method: "POST",
    body: { phone: "13800138000", password: "user123" },
    jar: userJar,
  });

  await check("admin login", 200, `${BASE}/api/auth/admin/login`, {
    method: "POST",
    body: { phone: "13900000001", password: "admin123" },
    jar: adminJar,
  });

  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying", "/admin/dict"]) {
    await check(`GET ${path}`, 200, `${BASE}${path}`, { jar: adminJar });
  }

  const project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  const listing = await prisma.dryingFieldListing.findFirst();
  if (!project || !listing) {
    console.log("✗ missing seed data (auction project or drying listing)");
    fail += 2;
  } else {
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const minBid = topBid
      ? Number(topBid.amount) + Number(project.bidStep)
      : Number(project.startPrice);
    await check("auction bid", 200, `${BASE}/api/m/auction/${project.id}/bid`, {
      method: "POST",
      body: { amount: minBid },
      jar: userJar,
    });

    const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    await check("drying reserve", 200, `${BASE}/api/m/drying/reserve`, {
      method: "POST",
      body: { listingId: listing.id, startDate: start, endDate: end },
      jar: userJar,
    });

    await check("drying reserve duplicate dates", 409, `${BASE}/api/m/drying/reserve`, {
      method: "POST",
      body: { listingId: listing.id, startDate: start, endDate: end },
      jar: userJar,
    });
  }

  await check("register duplicate phone", 409, `${BASE}/api/auth/register`, {
    method: "POST",
    body: { phone: "13800138000", password: "user123", name: "重复" },
  });

  await check("invalid login", 401, `${BASE}/api/auth/login`, {
    method: "POST",
    body: { phone: "13800138000", password: "wrong" },
  });

  const uploadRes = await fetch(`${BASE}/api/upload`, { method: "POST" });
  if (uploadRes.status === 401 || uploadRes.status === 400) {
    console.log(`✓ upload unauth (${uploadRes.status})`);
    pass++;
  } else {
    console.log(`✗ upload unauth expected 401/400 got ${uploadRes.status}`);
    fail++;
  }

  const dictCount = await prisma.dictCategory.count();
  if (dictCount >= 10) {
    console.log(`✓ dict categories seeded (${dictCount})`);
    pass++;
  } else {
    console.log(`✗ dict categories seeded expected >=10 got ${dictCount}`);
    fail++;
  }

  console.log("---");
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
