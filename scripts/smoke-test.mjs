#!/usr/bin/env node
/**
 * API smoke test for sishi-zichan.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name}: ${detail}` : name;
    errors.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    redirect: "manual",
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(opts.body && typeof opts.body === "string" ? { "Content-Type": "application/json" } : {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, cookies: setCookie };
}

function cookieHeader(cookies) {
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

function extractId(html, pattern) {
  const m = html.match(pattern);
  return m?.[1] ?? null;
}

async function main() {
  console.log(`Smoke test @ ${BASE}\n`);

  // 1. Public pages
  console.log("Public pages:");
  const home = await req("/");
  assert("GET /", home.status === 200);
  const mHome = await req("/m");
  assert("GET /m", mHome.status === 200);
  const adminLogin = await req("/admin/login");
  assert("GET /admin/login", adminLogin.status === 200);

  // 2. Third-party token (dev)
  console.log("\nDev token:");
  const tokenRes = await req("/api/dev/third-party-token?u_id=smoke_test_user");
  assert("GET /api/dev/third-party-token", tokenRes.status === 200 && tokenRes.json?.token);
  const ssoToken = tokenRes.json?.token;

  // 3. User login
  console.log("\nUser auth:");
  const userLogin = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  assert("POST /api/auth/login", userLogin.status === 200 && userLogin.json?.ok);
  const userCookies = [...userLogin.cookies];

  // 4. Third-party SSO
  const sso = await req("/api/auth/third-party", {
    method: "POST",
    body: JSON.stringify({ token: ssoToken }),
  });
  assert("POST /api/auth/third-party", sso.status === 200 && sso.json?.ok);

  // 5. Admin login
  console.log("\nAdmin auth:");
  const adminLoginApi = await req("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  assert("POST /api/auth/admin/login", adminLoginApi.status === 200 && adminLoginApi.json?.ok);
  const adminCookies = [...adminLoginApi.cookies];

  // 6. Extract auction ID from /m/auction page
  console.log("\nAuction:");
  const auctionPage = await req("/m/auction", {
    headers: { Cookie: cookieHeader(userCookies) },
  });
  assert("GET /m/auction", auctionPage.status === 200);
  const auctionId = extractId(auctionPage.text, /\/m\/auction\/([a-z0-9]{20,})/i);
  assert("extract auction ID", !!auctionId, auctionId || "not found");

  if (auctionId) {
    let amount = 8200;
    let bidOk = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const bid = await req(`/api/m/auction/${auctionId}/bid`, {
        method: "POST",
        headers: { Cookie: cookieHeader(userCookies) },
        body: JSON.stringify({ amount }),
      });
      if (bid.status === 200 && bid.json?.ok) {
        bidOk = true;
        break;
      }
      const minMatch = String(bid.json?.error || "").match(/不低于\s*([\d.]+)/);
      if (minMatch) {
        amount = Math.ceil(parseFloat(minMatch[1]));
        continue;
      }
      assert("POST bid", false, `status=${bid.status} ${bid.json?.error || ""}`);
      break;
    }
    if (!errors.some((e) => e.startsWith("POST bid"))) {
      assert("POST bid", bidOk);
    }

    const bidLow = await req(`/api/m/auction/${auctionId}/bid`, {
      method: "POST",
      headers: { Cookie: cookieHeader(userCookies) },
      body: JSON.stringify({ amount: 100 }),
    });
    assert("POST bid (too low)", bidLow.status === 400, `expected 400 got ${bidLow.status}`);
  }

  // 7. Drying reserve
  console.log("\nDrying:");
  const dryingPage = await req("/m/drying", {
    headers: { Cookie: cookieHeader(userCookies) },
  });
  assert("GET /m/drying", dryingPage.status === 200);
  const listingId = extractId(dryingPage.text, /\/m\/drying\/([a-z0-9]{20,})/i);
  assert("extract listing ID", !!listingId, listingId || "not found");

  if (listingId) {
    let startDate = "";
    let endDate = "";
    let reserveOk = false;
    for (let offset = 1; offset <= 60; offset++) {
      const start = new Date();
      start.setDate(start.getDate() + offset);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      startDate = start.toISOString().slice(0, 10);
      endDate = end.toISOString().slice(0, 10);
      const reserve = await req("/api/m/drying/reserve", {
        method: "POST",
        headers: { Cookie: cookieHeader(userCookies) },
        body: JSON.stringify({ listingId, startDate, endDate }),
      });
      if (reserve.status === 200 && reserve.json?.ok) {
        reserveOk = true;
        break;
      }
      if (reserve.status !== 409) {
        assert(
          "POST reserve",
          false,
          `status=${reserve.status} ${reserve.json?.error || ""} (day +${offset})`,
        );
        reserveOk = false;
        break;
      }
    }
    if (!startDate) {
      assert("POST reserve", false, "no date range tried");
    } else if (reserveOk) {
      assert("POST reserve", true);
    } else if (!errors.some((e) => e.startsWith("POST reserve"))) {
      assert("POST reserve", false, "no available slot in 60 days");
    }

    const dup = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: cookieHeader(userCookies) },
      body: JSON.stringify({ listingId, startDate, endDate }),
    });
    assert("POST reserve duplicate", dup.status === 409, `expected 409 got ${dup.status}`);
  }

  // 8. Mock payment duplicate deposit
  console.log("\nPayments:");
  if (auctionId) {
    const payDup = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: cookieHeader(userCookies) },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: auctionId }),
    });
    assert("POST mock payment duplicate deposit", payDup.status === 409, `expected 409 got ${payDup.status}`);
  }

  // 9. Upload without multipart
  console.log("\nUpload:");
  const uploadNoFile = await req("/api/upload", {
    method: "POST",
    headers: { Cookie: cookieHeader(adminCookies), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert("POST /api/upload non-multipart", uploadNoFile.status === 400 || uploadNoFile.status === 401, `status=${uploadNoFile.status}`);

  const uploadUnauth = await req("/api/upload", {
    method: "POST",
    body: new FormData(),
  });
  assert("POST /api/upload unauth", uploadUnauth.status === 401, `status=${uploadUnauth.status}`);

  // 10. Admin assets non-multipart
  console.log("\nAdmin assets:");
  const assetBad = await req("/api/admin/assets", {
    method: "POST",
    headers: { Cookie: cookieHeader(adminCookies), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "test" }),
  });
  assert("POST /api/admin/assets non-multipart", assetBad.status === 400, `expected 400 got ${assetBad.status}`);

  // 11. Logout
  console.log("\nLogout:");
  const userLogout = await req("/api/auth/logout", {
    method: "POST",
    headers: { Cookie: cookieHeader(userCookies) },
  });
  assert("POST /api/auth/logout", userLogout.status === 200);

  const adminLogout = await req("/api/auth/admin/logout", {
    method: "POST",
    headers: { Cookie: cookieHeader(adminCookies) },
  });
  assert("POST /api/auth/admin/logout", adminLogout.status === 200);

  // Summary
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
  console.log("All smoke tests passed!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
