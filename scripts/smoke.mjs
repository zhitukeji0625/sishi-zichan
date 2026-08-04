/**
 * API / 页面冒烟测试（需 dev 或 start 在 3000 端口运行）
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function check(name, expect, actual) {
  if (actual === expect) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name} (expected ${expect}, got ${actual})`);
    failed++;
  }
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function main() {
  const jar = new Map();

  function cookieHeader() {
    return Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  function storeCookies(headers) {
    const raw = headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const part = line.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }

  const userLogin = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  storeCookies(userLogin.headers);
  check("user login", 200, userLogin.status);

  const adminJar = new Map();
  const adminLogin = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  for (const line of adminLogin.headers.getSetCookie?.() ?? []) {
    const part = line.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) adminJar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  check("admin login", 200, adminLogin.status);

  const adminCookie = Array.from(adminJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const tokenRes = await req("/api/dev/third-party-token?u_id=smoke_sso");
  check("third-party-token", 200, tokenRes.status);

  const ssoRes = await req("/api/auth/third-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenRes.json?.token }),
  });
  check("third-party login", 200, ssoRes.status);

  const pages = [
    "/",
    "/m",
    "/m/login",
    "/m/auction",
    "/m/drying",
    "/m/me",
    "/m/orders",
    "/admin/login",
    "/admin",
    "/admin/assets",
    "/admin/auctions",
    "/admin/drying",
    "/admin/dict",
    "/admin/admins",
    "/admin/announcements",
    "/admin/organizations",
    "/admin/registrations",
    "/admin/config",
    "/admin/audit",
  ];
  for (const path of pages) {
    const r = await fetch(`${BASE}${path}`, { headers: { Cookie: adminCookie } });
    check(`page ${path}`, 200, r.status);
  }

  const auctionPage = await fetch(`${BASE}/m/auction`, {
    headers: { Cookie: cookieHeader() },
  });
  const auctionHtml = await auctionPage.text();
  const projectMatch = auctionHtml.match(/\/m\/auction\/(c[a-z0-9]{20,})/i);
  if (!projectMatch) {
    console.log("FAIL: no auction project link on /m/auction");
    failed++;
  } else {
    const projectId = projectMatch[1];
    const bidRes = await req(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(),
      },
      body: JSON.stringify({ amount: 999999 }),
    });
    check("auction bid", 200, bidRes.status);
  }

  const dryingPage = await fetch(`${BASE}/m/drying`, {
    headers: { Cookie: cookieHeader() },
  });
  const dryingHtml = await dryingPage.text();
  const listingMatch = dryingHtml.match(/\/m\/drying\/(c[a-z0-9]{20,})/i);
  if (!listingMatch) {
    console.log("FAIL: no drying listing on /m/drying");
    failed++;
  } else {
    const listingId = listingMatch[1];
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const reserveRes = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(),
      },
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    check("drying reserve", 200, reserveRes.status);
  }

  const uploadRes = await req("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
    },
    body: JSON.stringify({ foo: "bar" }),
  });
  check("upload non-multipart", 400, uploadRes.status);

  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
