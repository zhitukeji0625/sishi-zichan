#!/usr/bin/env node
/**
 * Functional API test script - queries DB and tests endpoints
 */
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const prisma = new PrismaClient();

const results = [];

function log(test, ok, detail = "") {
  const status = ok ? "✓" : "✗";
  results.push({ test, ok, detail });
  console.log(`${status} ${test}${detail ? `: ${detail}` : ""}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

async function main() {
  // --- Auth tests ---
  const adminJar = new Map();
  const userJar = new Map();

  function cookieHeader(jar) {
    return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  function saveCookies(jar, headers) {
    const setCookie = headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      jar.set(k.trim(), v.trim());
    }
  }

  // Admin login
  const adminLogin = await fetchJson(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  saveCookies(adminJar, adminLogin.headers);
  log("Admin login", adminLogin.status === 200 && adminLogin.json?.ok === true, JSON.stringify(adminLogin.json));

  // User login
  const userLogin = await fetchJson(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  saveCookies(userJar, userLogin.headers);
  log("User login", userLogin.status === 200 && userLogin.json?.ok === true);

  // User register
  const newPhone = `139${Date.now().toString().slice(-8)}`;
  const reg = await fetchJson(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: newPhone, password: "test1234", name: "测试用户" }),
  });
  log("User register", reg.status === 200 && reg.json?.ok === true, `phone=${newPhone}`);

  // Third-party token
  const tokenResp = await fetchJson(`${BASE}/api/dev/third-party-token?u_id=test-user-002`);
  log("Third-party token", tokenResp.status === 200 && !!tokenResp.json?.token);

  if (tokenResp.json?.token) {
    const sso = await fetchJson(`${BASE}/api/auth/third-party`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenResp.json.token }),
    });
    log("Third-party SSO", sso.status === 200 && sso.json?.ok === true);
  }

  // --- Page tests ---
  const pages = [
  { path: "/admin", jar: adminJar },
  { path: "/admin/assets", jar: adminJar },
  { path: "/admin/auctions", jar: adminJar },
  { path: "/m/auction", jar: userJar },
  { path: "/m/drying", jar: userJar },
  { path: "/m/me", jar: userJar },
  { path: "/m/orders", jar: userJar },
  ];

  for (const { path, jar } of pages) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Cookie: cookieHeader(jar) },
    });
    log(`Page ${path}`, res.status === 200, `status=${res.status}`);
  }

  // --- Auction bid ---
  const project = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  if (project) {
    const currentBid = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const minBid = currentBid
      ? Number(currentBid.amount) + Number(project.bidStep)
      : Number(project.startPrice);
    const bid = await fetchJson(`${BASE}/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
      body: JSON.stringify({ amount: String(minBid) }),
    });
    log("Auction bid", bid.status === 200 && bid.json?.ok === true, `amount=${minBid}, resp=${JSON.stringify(bid.json)}`);
  } else {
    log("Auction bid", false, "no LIVE project found");
  }

  // --- Drying reserve ---
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    const reserve = await fetchJson(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    log("Drying reserve", reserve.status === 200 && reserve.json?.ok === true, JSON.stringify(reserve.json));
  } else {
    log("Drying reserve", false, "no OPERATING listing found");
  }

  // --- Mock payment (auction deposit) ---
  const unpaidReg = await prisma.auctionRegistration.findFirst({
    where: { depositPaid: false, status: "APPROVED" },
    include: { project: true },
  });
  if (unpaidReg) {
    const pay = await fetchJson(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(userJar) },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: unpaidReg.projectId }),
    });
    log("Mock payment (deposit)", pay.status === 200 && pay.json?.ok === true, JSON.stringify(pay.json));
  } else {
    log("Mock payment (deposit)", true, "skipped - all deposits paid");
  }

  // --- Admin create asset ---
  const org = await prisma.organization.findFirst();
  if (org) {
    const form = new FormData();
    form.append("orgId", org.id);
    form.append("type", "LAND");
    form.append("name", "自动化测试资产");
    form.append("locationText", "测试地点");
    form.append("status", "IDLE");
    const asset = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { Cookie: cookieHeader(adminJar) },
      body: form,
    });
    const assetJson = await asset.json();
    log("Admin create asset", asset.status === 200 && assetJson?.ok === true, JSON.stringify(assetJson));
  }

  // --- Logout ---
  const logout = await fetchJson(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookieHeader(userJar) },
  });
  log("User logout", logout.status === 200);

  const adminLogout = await fetchJson(`${BASE}/api/auth/admin/logout`, {
    method: "POST",
    headers: { Cookie: cookieHeader(adminJar) },
  });
  log("Admin logout", adminLogout.status === 200);

  // Summary
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length > 0) {
    console.log("Failed tests:");
    for (const f of failed) {
      console.log(`  - ${f.test}: ${f.detail}`);
    }
    process.exit(1);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
