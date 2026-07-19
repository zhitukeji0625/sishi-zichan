#!/usr/bin/env node
/**
 * Smoke test for sishi-zichan — run against dev server on localhost:3000
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;

function ok(msg) {
  console.log(`✓ ${msg}`);
  pass++;
}
function bad(msg, detail) {
  console.log(`✗ ${msg}${detail ? `: ${detail}` : ""}`);
  fail++;
}

async function loginAdmin() {
  const jar = new Map();
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    jar.set(k.trim(), v);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(`admin login failed: ${JSON.stringify(data)}`);
  return jar;
}

async function loginUser() {
  const jar = new Map();
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    jar.set(k.trim(), v);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(`user login failed: ${JSON.stringify(data)}`);
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function get(path, jar) {
  const headers = jar ? { Cookie: cookieHeader(jar) } : {};
  return fetch(`${BASE}${path}`, { headers, redirect: "manual" });
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  // Public pages
  for (const path of ["/", "/m", "/admin/login", "/m/login", "/m/register"]) {
    const res = await get(path);
    res.status === 200 ? ok(`GET ${path}`) : bad(`GET ${path}`, String(res.status));
  }

  // Admin auth + pages
  let adminJar;
  try {
    adminJar = await loginAdmin();
    ok("admin login");
  } catch (e) {
    bad("admin login", e.message);
    adminJar = null;
  }

  if (adminJar) {
    for (const path of [
      "/admin",
      "/admin/assets",
      "/admin/auctions",
      "/admin/drying",
      "/admin/dict",
      "/admin/organizations",
      "/admin/announcements",
      "/admin/registrations",
      "/admin/admins",
      "/admin/audit",
      "/admin/config",
    ]) {
      const res = await get(path, adminJar);
      res.status === 200 ? ok(`GET ${path}`) : bad(`GET ${path}`, String(res.status));
    }

    // Upload without multipart
    const uploadRes = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(adminJar),
      },
      body: "{}",
    });
    uploadRes.status === 400
      ? ok("upload non-multipart returns 400")
      : bad("upload non-multipart", String(uploadRes.status));
  }

  // User auth + pages
  let userJar;
  try {
    userJar = await loginUser();
    ok("user login");
  } catch (e) {
    bad("user login", e.message);
    userJar = null;
  }

  if (userJar) {
    for (const path of ["/m", "/m/auction", "/m/drying", "/m/me", "/m/orders"]) {
      const res = await get(path, userJar);
      res.status === 200 ? ok(`GET ${path}`) : bad(`GET ${path}`, String(res.status));
    }
  }

  // Third-party token
  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke-test`);
  const tokenData = await tokenRes.json();
  tokenData.token ? ok("third-party token") : bad("third-party token", JSON.stringify(tokenData));

  // Dict data
  const dictCount = await prisma.dictCategory.count();
  dictCount > 0 ? ok(`dict categories (${dictCount})`) : bad("dict categories missing");

  // Auction
  const auction = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  if (auction) {
    auction.status === "LIVE"
      ? ok(`demo auction LIVE (${auction.code})`)
      : bad("demo auction not LIVE", auction.status);

    if (userJar) {
      const pageRes = await get(`/m/auction/${auction.id}`, userJar);
      pageRes.status === 200
        ? ok("auction detail page")
        : bad("auction detail page", String(pageRes.status));

      const bidRes = await fetch(`${BASE}/api/m/auction/${auction.id}/bid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader(userJar),
        },
        body: JSON.stringify({ amount: Number(auction.startPrice) + Number(auction.bidStep) }),
      });
      const bidData = await bidRes.json();
      if (bidData.ok) {
        ok("bid placed");
      } else if (auction.status !== "LIVE") {
        ok(`bid rejected as expected (${bidData.error})`);
      } else {
        bad("bid", JSON.stringify(bidData));
      }
    }
  } else {
    bad("no auction project found");
  }

  // Drying
  const listing = await prisma.dryingFieldListing.findFirst();
  if (listing) {
    const res = await get(`/m/drying/${listing.id}`);
    res.status === 200 ? ok("drying detail page") : bad("drying detail page", String(res.status));
  } else {
    bad("no drying listing found");
  }

  // Mock payment duplicate check
  if (userJar && auction) {
    const payBody = {
      purpose: "AUCTION_DEPOSIT",
      auctionProjectId: auction.id,
      amount: Number(auction.depositAmount),
    };
    const pay1 = await fetch(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userJar),
      },
      body: JSON.stringify(payBody),
    });
    const pay2 = await fetch(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userJar),
      },
      body: JSON.stringify(payBody),
    });
    if (pay2.status === 409) {
      ok("duplicate deposit payment returns 409");
    } else if (pay1.status === 200 && pay2.status === 409) {
      ok("duplicate deposit payment returns 409");
    } else {
      bad("duplicate deposit payment", `pay1=${pay1.status} pay2=${pay2.status}`);
    }
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
