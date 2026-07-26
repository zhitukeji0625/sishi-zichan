#!/usr/bin/env node
import crypto from "node:crypto";
/**
 * API smoke tests — requires dev server + seeded DB.
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

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
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

function cookieJar(setCookie) {
  if (!setCookie) return "";
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`Smoke tests @ ${BASE}\n`);

  // User login
  const login = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  assert("user login", login.res.status === 200 && login.json?.ok);
  const userCookie = cookieJar(login.res.headers.getSetCookie?.() ?? login.res.headers.get("set-cookie"));

  // Admin login
  const adminLogin = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  assert("admin login", adminLogin.res.status === 200 && adminLogin.json?.ok);
  const adminCookie = cookieJar(adminLogin.res.headers.getSetCookie?.() ?? adminLogin.res.headers.get("set-cookie"));

  // Auction project ids from list page (try LIVE project for bid)
  const auctionPage = await fetch(`${BASE}/m/auction`);
  const auctionHtml = await auctionPage.text();
  const projectIds = [...auctionHtml.matchAll(/\/m\/auction\/(c[a-z0-9]{20,})/gi)].map((m) => m[1]);
  const uniqueProjectIds = [...new Set(projectIds)];
  assert("find auction project link", uniqueProjectIds.length > 0);

  let projectId = null;
  let bidOk = false;
  if (userCookie) {
    for (const id of uniqueProjectIds) {
      let amount = 10000;
      for (let attempt = 0; attempt < 6; attempt++) {
        const bid = await fetchJson(`/api/m/auction/${id}/bid`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: JSON.stringify({ amount }),
        });
        if (bid.res.status === 200 && bid.json?.ok) {
          projectId = id;
          bidOk = true;
          break;
        }
        const minMatch =
          typeof bid.json?.error === "string"
            ? bid.json.error.match(/不低于\s*([\d.]+)/)
            : null;
        if (minMatch) {
          amount = Math.ceil(parseFloat(minMatch[1]));
          continue;
        }
        if (bid.json?.error === "竞拍未在进行中") {
          break;
        }
        projectId = id;
        break;
      }
      if (bidOk) break;
    }
    assert("place bid on LIVE project", bidOk, projectId ?? "no project");

    if (projectId) {
      const depositDup = await fetchJson("/api/m/payments/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userCookie },
        body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId }),
      });
      assert("duplicate deposit 409", depositDup.res.status === 409, `${depositDup.res.status}`);
    }
  }

  // Drying reserve
  const dryingPage = await fetch(`${BASE}/m/drying`);
  const dryingHtml = await dryingPage.text();
  const listingMatch = dryingHtml.match(/\/m\/drying\/(c[a-z0-9]{20,})/i);
  const listingId = listingMatch?.[1] ?? null;
  assert("find drying listing", !!listingId);

  if (listingId && userCookie) {
    const dayOffset = 100 + (parseInt(crypto.randomBytes(4).toString("hex"), 16) % 500);
    const start = new Date();
    start.setDate(start.getDate() + dayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const reserve = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: fmt(start),
        endDate: fmt(end),
      }),
    });
    assert("drying reserve", reserve.res.status === 200 && reserve.json?.ok, `${reserve.res.status} ${JSON.stringify(reserve.json)}`);

    const dup = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId,
        startDate: fmt(start),
        endDate: fmt(end),
      }),
    });
    assert("duplicate reserve rejected", dup.res.status === 400, `${dup.res.status}`);
  }

  // Third-party SSO
  const tokenRes = await fetchJson("/api/dev/third-party-token?u_id=smoke_test_user");
  assert("dev third-party token", tokenRes.res.status === 200 && tokenRes.json?.token);
  if (tokenRes.json?.token) {
    const sso = await fetchJson("/api/auth/third-party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenRes.json.token }),
    });
    assert("third-party login", sso.res.status === 200 && sso.json?.ok);
  }

  // Upload without multipart
  const uploadBad = await fetchJson("/api/upload", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert("upload missing file 400", uploadBad.res.status === 400);

  // Public pages
  for (const path of ["/", "/m", "/m/login", "/admin/login"]) {
    const r = await fetch(`${BASE}${path}`);
    assert(`GET ${path}`, r.status === 200);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
