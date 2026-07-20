#!/usr/bin/env node
/**
 * API smoke tests for sishi-zichan
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  errors.push({ name, detail });
  console.log(`  ✗ ${name}: ${detail}`);
}

async function req(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, { redirect: "manual", ...opts });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
  }
  return { res, text, json };
}

function cookieHeader(setCookie) {
  if (!setCookie) return "";
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`Smoke tests against ${BASE}\n`);

  // 1. Public pages
  {
    const { res } = await req("/");
    res.status === 200 ? ok("GET /") : fail("GET /", `status ${res.status}`);
  }
  {
    const { res } = await req("/m");
    res.status === 200 ? ok("GET /m") : fail("GET /m", `status ${res.status}`);
  }
  {
    const { res } = await req("/admin/login");
    res.status === 200 ? ok("GET /admin/login") : fail("GET /admin/login", `status ${res.status}`);
  }

  // 2. Auth validation
  {
    const { res, json } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    res.status === 400 && json?.error ? ok("POST /api/auth/login empty → 400") : fail("POST /api/auth/login empty", `status ${res.status}`);
  }
  {
    const { res } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "00000000000", password: "wrong" }),
    });
    res.status === 401 ? ok("POST /api/auth/login wrong creds → 401") : fail("POST /api/auth/login wrong creds", `status ${res.status}`);
  }

  // 3. Admin login
  let adminCookie = "";
  {
    const { res, json } = await req("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    adminCookie = cookieHeader(sc.length ? sc : res.headers.get("set-cookie"));
    if (res.status === 200 && json?.ok && adminCookie) ok("POST /api/auth/admin/login");
    else fail("POST /api/auth/admin/login", `status ${res.status}, cookie=${!!adminCookie}`);
  }

  // 4. Upload without auth
  {
    const { res } = await req("/api/upload", { method: "POST" });
    res.status === 401 ? ok("POST /api/upload no auth → 401") : fail("POST /api/upload no auth", `status ${res.status}`);
  }

  // 5. Upload non-multipart (should not 500)
  {
    const { res } = await req("/api/upload", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "{}",
    });
    res.status === 400 || res.status === 500
      ? res.status === 400
        ? ok("POST /api/upload non-multipart → 400")
        : fail("POST /api/upload non-multipart", `expected 400, got ${res.status}`)
      : fail("POST /api/upload non-multipart", `unexpected status ${res.status}`);
  }

  // 6. Admin assets non-multipart
  {
    const { res } = await req("/api/admin/assets", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "{}",
    });
    res.status === 400 || res.status === 500
      ? res.status === 400
        ? ok("POST /api/admin/assets non-multipart → 400")
        : fail("POST /api/admin/assets non-multipart", `expected 400, got ${res.status}`)
      : fail("POST /api/admin/assets non-multipart", `unexpected status ${res.status}`);
  }

  // 7. User login
  let userCookie = "";
  {
    const { res, json } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    userCookie = cookieHeader(sc.length ? sc : res.headers.get("set-cookie"));
    if (res.status === 200 && json?.ok && userCookie) ok("POST /api/auth/login user");
    else fail("POST /api/auth/login user", `status ${res.status}`);
  }

  // 8. Third-party token (dev)
  {
    const { res, json } = await req("/api/dev/third-party-token?u_id=smoke_test");
    res.status === 200 && json?.token ? ok("GET /api/dev/third-party-token") : fail("GET /api/dev/third-party-token", `status ${res.status}`);
  }

  // 9. Bid without login
  {
    const { res } = await req("/api/m/auction/fake-id/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    res.status === 401 ? ok("POST bid no auth → 401") : fail("POST bid no auth", `status ${res.status}`);
  }

  // 10. Drying reserve without login
  {
    const { res } = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: "x", startDate: "2026-08-01", endDate: "2026-08-02" }),
    });
    res.status === 401 ? ok("POST drying/reserve no auth → 401") : fail("POST drying/reserve no auth", `status ${res.status}`);
  }

  // 11. Drying reserve bad params
  {
    const { res, json } = await req("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: "invalid" }),
    });
    res.status === 400 && json?.error ? ok("POST drying/reserve bad params → 400") : fail("POST drying/reserve bad params", `status ${res.status}`);
  }

  // 12. Mock payment no auth
  {
    const { res } = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT" }),
    });
    res.status === 401 ? ok("POST payments/mock no auth → 401") : fail("POST payments/mock no auth", `status ${res.status}`);
  }

  // 13. Auction pages
  {
    const { res } = await req("/m/auction");
    res.status === 200 ? ok("GET /m/auction") : fail("GET /m/auction", `status ${res.status}`);
  }
  {
    const { res } = await req("/m/drying");
    res.status === 200 ? ok("GET /m/drying") : fail("GET /m/drying", `status ${res.status}`);
  }

  // 14. Admin protected pages redirect
  {
    const { res } = await req("/admin/assets");
    res.status === 307 || res.status === 302 || res.status === 200
      ? ok("GET /admin/assets (auth check)")
      : fail("GET /admin/assets", `status ${res.status}`);
  }

  // 15. Register validation
  {
    const { res, json } = await req("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "123" }),
    });
    res.status === 400 && json?.error ? ok("POST /api/auth/register invalid → 400") : fail("POST /api/auth/register invalid", `status ${res.status} ${json?.error}`);
  }

  // 16. Logout
  {
    const { res } = await req("/api/auth/logout", { method: "POST", headers: { Cookie: userCookie } });
    res.status === 200 ? ok("POST /api/auth/logout") : fail("POST /api/auth/logout", `status ${res.status}`);
  }
  {
    const { res } = await req("/api/auth/admin/logout", { method: "POST", headers: { Cookie: adminCookie } });
    res.status === 200 ? ok("POST /api/auth/admin/logout") : fail("POST /api/auth/admin/logout", `status ${res.status}`);
  }

  // 17. Re-login user for functional tests
  let projectId = "";
  let listingId = "";
  {
    const { res, json } = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    userCookie = cookieHeader(sc.length ? sc : res.headers.get("set-cookie"));
    if (res.status === 200 && userCookie) ok("Re-login user for functional tests");
    else fail("Re-login user", `status ${res.status}`);
  }

  // 18. Auction bid (needs LIVE project from seed)
  {
    const auctionPage = await req("/m/auction");
    const matches = [...auctionPage.text.matchAll(/\/m\/auction\/([a-z0-9]{20,})/gi)];
    projectId = matches[0]?.[1] ?? "";
    if (!projectId) {
      fail("Auction bid", "no project id found on /m/auction");
    } else {
      const { res, json } = await req(`/api/m/auction/${projectId}/bid`, {
        method: "POST",
        headers: { Cookie: userCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 8000 }),
      });
      if (res.status === 200 && json?.ok) ok(`POST bid on project ${projectId}`);
      else fail("Auction bid", `status ${res.status} ${json?.error ?? ""}`);
    }
  }

  // 19. Duplicate deposit payment → 409
  if (projectId) {
    const { res, json } = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { Cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId }),
    });
    res.status === 409 ? ok("POST duplicate AUCTION_DEPOSIT → 409") : fail("POST duplicate AUCTION_DEPOSIT", `status ${res.status} ${json?.error ?? ""}`);
  }

  // 20. Drying reservation
  {
    const dryingPage = await req("/m/drying");
    const matches = [...dryingPage.text.matchAll(/\/m\/drying\/([a-z0-9]{20,})/gi)];
    listingId = matches[0]?.[1] ?? "";
    if (!listingId) {
      fail("Drying reserve", "no listing id found on /m/drying");
    } else {
      const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const end = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { res, json } = await req("/api/m/drying/reserve", {
        method: "POST",
        headers: { Cookie: userCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, startDate: start, endDate: end }),
      });
      if (res.status === 200 && json?.ok) ok(`POST drying/reserve listing ${listingId}`);
      else fail("Drying reserve", `status ${res.status} ${json?.error ?? ""}`);
    }
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e.name}: ${e.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
