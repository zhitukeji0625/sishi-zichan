#!/usr/bin/env node
/**
 * Functional smoke tests — requires dev server running.
 * Usage: BASE_URL=http://localhost:3000 node scripts/functional-smoke.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function jsonPost(path, body, cookieJar) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieJar ?? "" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function getStatus(path, cookieJar) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookieJar ? { Cookie: cookieJar } : {},
    redirect: "manual",
  });
  return res.status;
}

function extractCookies(setCookieHeaders) {
  const parts = [];
  for (const h of setCookieHeaders) {
    const seg = h.split(";")[0];
    if (seg) parts.push(seg);
  }
  return parts.join("; ");
}

async function main() {
  console.log(`Smoke tests against ${BASE}\n`);

  // Public pages
  assert("Portal /", (await getStatus("/")) === 200);
  assert("Mobile /m", (await getStatus("/m")) === 200);
  assert("Admin login", (await getStatus("/admin/login")) === 200);

  // Admin login
  const adminRes = await jsonPost("/api/auth/admin/login", {
    phone: "13900000001",
    password: "admin123",
  });
  const adminCookies = extractCookies(
  adminRes.headers.getSetCookie?.() ?? [adminRes.headers.get("set-cookie")].filter(Boolean),
  );
  assert("Admin login API", adminRes.data?.ok === true, JSON.stringify(adminRes.data));

  const adminPages = [
    "/admin",
    "/admin/assets",
    "/admin/auctions",
    "/admin/drying",
    "/admin/organizations",
    "/admin/registrations",
    "/admin/announcements",
    "/admin/admins",
    "/admin/config",
    "/admin/dict",
    "/admin/audit",
  ];
  for (const p of adminPages) {
    assert(`Admin ${p}`, (await getStatus(p, adminCookies)) === 200);
  }

  // User login
  const userRes = await jsonPost("/api/auth/login", {
    phone: "13800138000",
    password: "user123",
  });
  const userCookies = extractCookies(
    userRes.headers.getSetCookie?.() ?? [userRes.headers.get("set-cookie")].filter(Boolean),
  );
  assert("User login API", userRes.data?.ok === true, JSON.stringify(userRes.data));

  const mobilePages = ["/m", "/m/auction", "/m/drying", "/m/orders", "/m/me"];
  for (const p of mobilePages) {
    assert(`Mobile ${p}`, (await getStatus(p, userCookies)) === 200);
  }

  // Third-party token (dev only)
  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke_test`);
  const tokenData = await tokenRes.json();
  assert("Dev third-party token", !!tokenData.token);

  // Drying reservation
  const listingRes = await fetch(`${BASE}/m/drying`, { headers: { Cookie: userCookies } });
  const dryingHtml = await listingRes.text();
  const listingMatch = dryingHtml.match(/\/m\/drying\/(c[a-z0-9]+)/);
  if (listingMatch) {
    const listingId = listingMatch[1];
    const reserveRes = await jsonPost(
      "/api/m/drying/reserve",
      { listingId, startDate: "2026-08-01", endDate: "2026-08-02" },
      userCookies,
    );
    assert("Drying reserve API", reserveRes.data?.ok === true, JSON.stringify(reserveRes.data));
  } else {
    assert("Drying reserve API", false, "no listing found");
  }

  // Check admin assets page shows Chinese labels (not raw enums)
  const assetsRes = await fetch(`${BASE}/admin/assets`, { headers: { Cookie: adminCookies } });
  const assetsHtml = await assetsRes.text();
  const hasRawEnum = />\s*(LAND|IDLE|IN_USE|DRYING_FIELD|LIVE)\s*</.test(assetsHtml);
  assert("Admin assets Chinese labels", !hasRawEnum, "raw enum values visible");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
