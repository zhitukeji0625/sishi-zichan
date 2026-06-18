#!/usr/bin/env node
/**
 * Functional smoke tests — requires dev server at BASE_URL (default http://localhost:3000).
 * Run: npm run dev && npm run test:functional
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

const CUID_RE = /\/m\/auction\/(c[a-z0-9]{20,})/i;
const LISTING_RE = /\/m\/drying\/(c[a-z0-9]{20,})/i;

async function fetchAuctionProjectId() {
  const html = await fetch(`${BASE}/m/auction`).then((r) => r.text());
  return html.match(CUID_RE)?.[1] ?? "";
}

async function fetchDryingListingId() {
  const html = await fetch(`${BASE}/m/drying`).then((r) => r.text());
  return html.match(LISTING_RE)?.[1] ?? "";
}

async function computeMinBid(projectId, cookie) {
  const { json } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ amount: 1 }),
  });
  const msg = json?.error ?? "";
  const m = msg.match(/不低于\s*([\d.]+)/);
  if (m) return parseFloat(m[1]);
  return 8200;
}

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, json, text };
}

function cookieHeader(setCookieHeaders) {
  if (!setCookieHeaders) return "";
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return list.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`Functional smoke tests @ ${BASE}\n`);

  // 1. Public pages
  {
    const { res } = await fetchJson("/");
    assert("GET / returns 200", res.status === 200);
  }
  for (const path of ["/m", "/m/auction", "/m/drying", "/m/login", "/admin/login"]) {
    const { res } = await fetchJson(path);
    assert(`GET ${path} returns 200`, res.status === 200, `got ${res.status}`);
  }

  // 2. Admin login
  let adminCookie = "";
  {
    const { res, json } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminCookie = cookieHeader(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    assert("Admin login ok", res.status === 200 && json?.ok === true, JSON.stringify(json));
  }

  // 3. Admin protected pages
  for (const path of ["/admin", "/admin/dict", "/admin/assets", "/admin/auctions"]) {
    const { res } = await fetchJson(path, {
      headers: adminCookie ? { Cookie: adminCookie } : {},
    });
    assert(`GET ${path} (admin) returns 200`, res.status === 200, `got ${res.status}`);
  }

  // 4. User login
  let userCookie = "";
  {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userCookie = cookieHeader(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    assert("User login ok", res.status === 200 && json?.ok === true, JSON.stringify(json));
  }

  // 6. Third-party token + SSO login (separate session, does not replace demo user cookie)
  {
    const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=smoke-test-user");
    assert("Dev third-party token", res.status === 200 && json?.token, JSON.stringify(json));
    const ssoToken = json?.token ?? "";

    const { res: ssoRes, json: ssoJson } = await fetchJson("/api/auth/third-party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ssoToken }),
    });
    assert("Third-party SSO login", ssoRes.status === 200 && ssoJson?.ok === true, JSON.stringify(ssoJson));
  }

  // 7. Auction bid — need LIVE project
  let projectId = "";
  {
    const { res } = await fetchJson("/m/auction");
    assert("GET /m/auction returns 200", res.status === 200);

    projectId = await fetchAuctionProjectId();

    if (!projectId) {
      assert("Found auction project in page", false, "no project link found");
    } else {
      assert("Found auction project in page", true);

      const bidAmount = await computeMinBid(projectId, userCookie);

      const { res: bidRes, json: bidJson } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userCookie ? { Cookie: userCookie } : {}),
        },
        body: JSON.stringify({ amount: bidAmount }),
      });
      assert(
        "Place bid on LIVE auction",
        bidRes.status === 200 && bidJson?.ok === true && bidJson?.bidId,
        JSON.stringify(bidJson),
      );
    }
  }

  // 8. Drying reservation
  let listingId = "";
  {
    listingId = await fetchDryingListingId();
    assert("Found drying listing in page", !!listingId, "no listing link");

    if (listingId) {
      const start = new Date();
      start.setDate(start.getDate() + 3);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const fmt = (d) => d.toISOString().slice(0, 10);

      const { res, json } = await fetchJson("/api/m/drying/reserve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userCookie ? { Cookie: userCookie } : {}),
        },
        body: JSON.stringify({
          listingId,
          startDate: fmt(start),
          endDate: fmt(end),
        }),
      });
      assert(
        "Drying reservation",
        res.status === 200 && json?.ok === true && json?.id,
        JSON.stringify(json),
      );
    }
  }

  // 9. Unauthenticated bid rejected
  if (projectId) {
    const bidAmount = await computeMinBid(projectId, userCookie);
    const { res } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: bidAmount }),
    });
    assert("Unauthenticated bid returns 401", res.status === 401);
  }

  // 10. Admin logout
  {
    const { res, json } = await fetchJson("/api/auth/admin/logout", {
      method: "POST",
      headers: adminCookie ? { Cookie: adminCookie } : {},
    });
    assert("Admin logout ok", res.status === 200 && json?.ok === true, JSON.stringify(json));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
