#!/usr/bin/env node
/**
 * Functional smoke test for sishi-zichan.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  console.error(`  ✗ ${name}: ${detail}`);
}

async function fetchText(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  return { res, text };
}

async function fetchJson(path, opts = {}) {
  const { res, text } = await fetchText(path, opts);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, json, text };
}

function extractAuctionIds(html) {
  const ids = new Set();
  const re = /\/m\/auction\/([a-z0-9]{20,})/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

function extractListingIds(html) {
  const ids = new Set();
  const re = /\/m\/drying\/([a-z0-9]{20,})/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

async function run() {
  console.log(`Smoke test against ${BASE}\n`);

  const publicPages = ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"];
  for (const path of publicPages) {
    const { res } = await fetchText(path);
    if (res.status === 200) ok(`GET ${path}`);
    else fail(`GET ${path}`, `status ${res.status}`);
  }

  const { res: adminRes, json: adminJson } = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const adminCookie = adminRes.headers.getSetCookie?.() ?? [];
  if (adminRes.status === 200 && adminJson?.ok) ok("Admin login");
  else fail("Admin login", JSON.stringify(adminJson));

  const adminCookieHeader = adminCookie.map((c) => c.split(";")[0]).join("; ");

  const { res: userRes, json: userJson } = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const userCookie = userRes.headers.getSetCookie?.() ?? [];
  if (userRes.status === 200 && userJson?.ok) ok("User login");
  else fail("User login", JSON.stringify(userJson));

  const userCookieHeader = userCookie.map((c) => c.split(";")[0]).join("; ");

  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/dict"]) {
    const { res } = await fetchText(path, { headers: { Cookie: adminCookieHeader } });
    if (res.status === 200) ok(`Admin page ${path}`);
    else fail(`Admin page ${path}`, `status ${res.status}`);
  }

  const { text: dictHtml } = await fetchText("/admin/dict", { headers: { Cookie: adminCookieHeader } });
  if (dictHtml.includes("资产类型") && dictHtml.includes("竞拍状态")) ok("Dict labels on admin page");
  else fail("Dict labels on admin page", "missing Chinese labels");

  const { text: auctionHtml } = await fetchText("/m/auction");
  if (auctionHtml.includes("资产竞拍")) ok("Auction list page");
  else fail("Auction list page", "missing title");

  const auctionIds = extractAuctionIds(auctionHtml);
  if (auctionIds.length > 0) ok(`Auction links found (${auctionIds.length})`);
  else fail("Auction links", "no project IDs in HTML");

  if (auctionHtml.includes("进行中") || auctionHtml.includes("已结束")) {
    ok("Auction status dict labels");
  } else if (auctionHtml.match(/\b(LIVE|ENDED)\b/)) {
    fail("Auction status dict labels", "raw enum shown instead of Chinese");
  } else {
    ok("Auction status dict labels (no projects)");
  }

  const projectId = auctionIds[0];
  if (projectId) {
    const { res: detailRes, text: detailHtml } = await fetchText(`/m/auction/${projectId}`, {
      headers: { Cookie: userCookieHeader },
    });
    if (detailRes.status === 200) ok(`Auction detail /m/auction/${projectId}`);
    else fail("Auction detail", `status ${detailRes.status}`);

    const { res: bidRes, json: bidJson } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookieHeader },
      body: JSON.stringify({ amount: 10000 }),
    });
    if (bidRes.status === 200 && bidJson?.ok) ok("Place bid");
    else if (bidJson?.error?.includes("未在进行中")) fail("Place bid", "auction not LIVE — run npm run db:seed");
    else fail("Place bid", JSON.stringify(bidJson));
  }

  const { text: dryingHtml } = await fetchText("/m/drying");
  const listingIds = extractListingIds(dryingHtml);
  if (listingIds.length > 0) ok(`Drying links found (${listingIds.length})`);
  else fail("Drying links", "no listing IDs");

  const listingId = listingIds[0];
  if (listingId) {
    const start = new Date();
    start.setMonth(start.getMonth() + 2);
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const { res: reserveRes, json: reserveJson } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookieHeader },
      body: JSON.stringify({ listingId, startDate: fmt(start), endDate: fmt(end) }),
    });
    if (reserveRes.status === 200 && reserveJson?.ok) ok("Drying reservation");
    else fail("Drying reservation", JSON.stringify(reserveJson));
  }

  for (const path of ["/m/me", "/m/orders"]) {
    const { res } = await fetchText(path, { headers: { Cookie: userCookieHeader } });
    if (res.status === 200) ok(`User page ${path}`);
    else fail(`User page ${path}`, `status ${res.status}`);
  }

  const { res: noAuthRes } = await fetchJson("/api/m/auction/fake/bid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  if (noAuthRes.status === 401) ok("Unauthenticated API blocked");
  else fail("Unauthenticated API blocked", `status ${noAuthRes.status}`);

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
