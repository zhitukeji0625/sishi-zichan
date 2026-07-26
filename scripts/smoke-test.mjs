#!/usr/bin/env node
/**
 * Functional smoke test for sishi-zichan platform.
 * Run with dev server at http://localhost:3000
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

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, text, json };
}

function getCookie(res, name) {
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function main() {
  console.log(`\nSmoke test against ${BASE}\n`);

  // --- Public pages ---
  for (const path of ["/", "/m", "/m/login", "/m/register", "/m/auction", "/m/drying", "/admin/login"]) {
    try {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      if (res.status === 200) ok(`GET ${path} → 200`);
      else fail(`GET ${path}`, `status ${res.status}`);
    } catch (e) {
      fail(`GET ${path}`, e.message);
    }
  }

  // --- Dev third-party token ---
  let ssoToken;
  try {
    const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=smoke-test-user");
    if (res.status === 200 && json?.token) {
      ssoToken = json.token;
      ok("GET /api/dev/third-party-token → token");
    } else {
      fail("GET /api/dev/third-party-token", `status ${res.status}`);
    }
  } catch (e) {
    fail("GET /api/dev/third-party-token", e.message);
  }

  // --- User login ---
  let userCookie = "";
  try {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    const c = getCookie(res, "sishi_user_session");
    if (res.status === 200 && json?.ok && c) {
      userCookie = c;
      ok("POST /api/auth/login (demo user) → 200 + cookie");
    } else {
      fail("POST /api/auth/login", `status ${res.status}, body=${JSON.stringify(json)}`);
    }
  } catch (e) {
    fail("POST /api/auth/login", e.message);
  }

  // --- Admin login ---
  let adminCookie = "";
  try {
    const { res, json } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    const c = getCookie(res, "sishi_admin_session");
    if (res.status === 200 && json?.ok && c) {
      adminCookie = c;
      ok("POST /api/auth/admin/login (division admin) → 200 + cookie");
    } else {
      fail("POST /api/auth/admin/login", `status ${res.status}, body=${JSON.stringify(json)}`);
    }
  } catch (e) {
    fail("POST /api/auth/admin/login", e.message);
  }

  // --- Protected user pages ---
  if (userCookie) {
    for (const path of ["/m/me", "/m/orders"]) {
      try {
        const res = await fetch(`${BASE}${path}`, {
          headers: { Cookie: userCookie },
          redirect: "manual",
        });
        if (res.status === 200) ok(`GET ${path} (authed) → 200`);
        else fail(`GET ${path} (authed)`, `status ${res.status}`);
      } catch (e) {
        fail(`GET ${path} (authed)`, e.message);
      }
    }
  }

  // --- Protected admin pages ---
  if (adminCookie) {
    for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/dict"]) {
      try {
        const res = await fetch(`${BASE}${path}`, {
          headers: { Cookie: adminCookie },
          redirect: "manual",
        });
        if (res.status === 200) ok(`GET ${path} (admin) → 200`);
        else fail(`GET ${path} (admin)`, `status ${res.status}`);
      } catch (e) {
        fail(`GET ${path} (admin)`, e.message);
      }
    }
  }

  // --- API: unauthenticated bid should 401 ---
  try {
    const { res } = await fetchJson("/api/m/auction/fake-id/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 1000 }),
    });
    if (res.status === 401) ok("POST /api/m/auction/[id]/bid (no auth) → 401");
    else fail("POST /api/m/auction/[id]/bid (no auth)", `status ${res.status}`);
  } catch (e) {
    fail("POST /api/m/auction/[id]/bid (no auth)", e.message);
  }

  // --- API: upload without multipart → 400 ---
  if (adminCookie) {
    try {
      const { res } = await fetchJson("/api/upload", {
        method: "POST",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 400) ok("POST /api/upload (non-multipart) → 400");
      else fail("POST /api/upload (non-multipart)", `status ${res.status}`);
    } catch (e) {
      fail("POST /api/upload (non-multipart)", e.message);
    }
  }

  // --- Find LIVE auction and place bid ---
  if (userCookie) {
    try {
      const res = await fetch(`${BASE}/m/auction`, {
        headers: { Cookie: userCookie },
      });
      const html = await res.text();
      const match = html.match(/href="\/m\/auction\/([^"]+)"/);
      if (match) {
        const projectId = match[1];
        ok(`Found auction link: ${projectId}`);

        const detailRes = await fetch(`${BASE}/m/auction/${projectId}`, {
          headers: { Cookie: userCookie },
        });
        if (detailRes.status === 200) ok(`GET /m/auction/${projectId} → 200`);
        else fail(`GET /m/auction/${projectId}`, `status ${detailRes.status}`);

        const { res: bidRes, json: bidJson } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
          method: "POST",
          headers: { Cookie: userCookie, "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 50000 }),
        });
        if (bidRes.status === 200 || bidRes.status === 400) {
          ok(`POST /api/m/auction/${projectId}/bid → ${bidRes.status} (${bidJson?.error || "ok"})`);
        } else {
          fail(`POST bid`, `status ${bidRes.status}, body=${JSON.stringify(bidJson)}`);
        }
      } else {
        fail("Find LIVE auction", "no auction link found in /m/auction");
      }
    } catch (e) {
      fail("Auction bid flow", e.message);
    }
  }

  // --- Drying reserve ---
  if (userCookie) {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);
      const fmt = (d) => d.toISOString().slice(0, 10);

      const listRes = await fetch(`${BASE}/m/drying`, {
        headers: { Cookie: userCookie },
      });
      const listHtml = await listRes.text();
      const dryMatch = listHtml.match(/href="\/m\/drying\/([^"]+)"/);

      if (dryMatch) {
        const listingId = dryMatch[1];
        ok(`Found drying listing: ${listingId}`);

        const { res: reserveRes, json: reserveJson } = await fetchJson("/api/m/drying/reserve", {
          method: "POST",
          headers: { Cookie: userCookie, "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            startDate: fmt(tomorrow),
            endDate: fmt(dayAfter),
          }),
        });
        if ([200, 201, 400, 409].includes(reserveRes.status)) {
          ok(`POST /api/m/drying/reserve → ${reserveRes.status} (${reserveJson?.error || "ok"})`);
        } else {
          fail("POST /api/m/drying/reserve", `status ${reserveRes.status}, body=${JSON.stringify(reserveJson)}`);
        }
      } else {
        fail("Find drying listing", "no drying link found");
      }
    } catch (e) {
      fail("Drying reserve flow", e.message);
    }
  }

  // --- Third-party SSO ---
  if (ssoToken) {
    try {
      const { res, json } = await fetchJson("/api/auth/third-party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ssoToken }),
      });
      if (res.status === 200 && json?.ok) ok("POST /api/auth/third-party → 200");
      else fail("POST /api/auth/third-party", `status ${res.status}, body=${JSON.stringify(json)}`);
    } catch (e) {
      fail("POST /api/auth/third-party", e.message);
    }
  }

  // --- Summary ---
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (errors.length) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e.name}: ${e.detail}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
