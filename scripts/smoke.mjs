#!/usr/bin/env node
/**
 * API smoke tests against running dev server (default http://localhost:3000).
 * Usage: node scripts/smoke.mjs
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function jar() {
  const cookies = new Map();
  return {
    setFromResponse(res) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...(opts.headers || {}) };
  if (opts.jar?.header()) headers.Cookie = opts.jar.header();
  const res = await fetch(url, { ...opts, headers });
  if (opts.jar) opts.jar.setFromResponse(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
  }
  return { status: res.status, text, json, headers: res.headers };
}

function check(name, cond, detail = "") {
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

async function main() {
  console.log(`Smoke tests → ${BASE}\n`);

  // Public pages
  for (const path of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const r = await req(path);
    check(`GET ${path} → 200`, r.status === 200, `got ${r.status}`);
  }

  // Dev third-party token
  const tok = await req("/api/dev/third-party-token?u_id=smoke-test-user");
  check("GET /api/dev/third-party-token → 200", tok.status === 200, `got ${tok.status}`);
  check("third-party token has token field", !!tok.json?.token);

  // Admin login
  const adminJar = jar();
  const adminLogin = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    jar: adminJar,
  });
  check("admin login → 200", adminLogin.status === 200, `got ${adminLogin.status}`);
  check("admin login ok", adminLogin.json?.ok === true);

  const adminHome = await req("/admin", { jar: adminJar });
  check("GET /admin (authed) → 200", adminHome.status === 200, `got ${adminHome.status}`);

  const adminDict = await req("/admin/dict", { jar: adminJar });
  check("GET /admin/dict → 200", adminDict.status === 200, `got ${adminDict.status}`);
  check("admin dict page has content", adminDict.text.length > 500);

  // Upload without multipart → 400
  const uploadBad = await req("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    jar: adminJar,
  });
  check("upload non-multipart → 400", uploadBad.status === 400, `got ${uploadBad.status}`);

  // Upload without auth → 401
  const uploadNoAuth = await req("/api/upload", { method: "POST" });
  check("upload no auth → 401", uploadNoAuth.status === 401, `got ${uploadNoAuth.status}`);

  // End user login
  const userJar = jar();
  const userLogin = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    jar: userJar,
  });
  check("user login → 200", userLogin.status === 200, `got ${userLogin.status}`);

  const auctionPage = await req("/m/auction", { jar: userJar });
  check("GET /m/auction (authed) → 200", auctionPage.status === 200, `got ${auctionPage.status}`);

  // Find LIVE auction project id from page or API - query DB via a helper endpoint
  // Parse auction link (CUID ids start with 'c'; avoid Next.js /m/auction/page prefetch noise)
  const auctionMatch = auctionPage.text.match(/\/m\/auction\/(c[a-z0-9]{20,})/i);
  const projectId = auctionMatch?.[1];
  check("auction page has LIVE project link", !!projectId, "no /m/auction/<id> found");

  if (projectId) {
    const detail = await req(`/m/auction/${projectId}`, { jar: userJar });
    check(`GET /m/auction/${projectId} → 200`, detail.status === 200, `got ${detail.status}`);
    check("auction detail shows bid form or live status", /出价|竞拍中|当前价/.test(detail.text));

    const bid = await req(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 8200 }),
      jar: userJar,
    });
    check("place bid → 200", bid.status === 200, `got ${bid.status} ${bid.text.slice(0, 120)}`);

    const bidDup = await req(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 8200 }),
      jar: userJar,
    });
    check("duplicate bid rejected", bidDup.status >= 400, `got ${bidDup.status}`);

    // Mock payment duplicate deposit → 409
    const payDup = await req("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId }),
      jar: userJar,
    });
    check("duplicate deposit payment → 409", payDup.status === 409, `got ${payDup.status} ${payDup.text}`);
  }

  // Drying reserve flow
  const drying = await req("/m/drying", { jar: userJar });
  check("GET /m/drying → 200", drying.status === 200, `got ${drying.status}`);
  const dryingMatch = drying.text.match(/\/m\/drying\/(c[a-z0-9]{20,})/i);
  const listingId = dryingMatch?.[1];
  check("drying page has listing link", !!listingId);

  if (listingId) {
    const dryingDetail = await req(`/m/drying/${listingId}`, { jar: userJar });
    check(`GET /m/drying/${listingId} → 200`, dryingDetail.status === 200, `got ${dryingDetail.status}`);
  }

  // SSO with token
  if (tok.json?.token) {
    const sso = await req(`/m/sso?token=${encodeURIComponent(tok.json.token)}`);
    check("GET /m/sso?token=… → 200 or redirect", sso.status === 200 || sso.status === 307, `got ${sso.status}`);
  }

  // Invalid login
  const badLogin = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
  });
  check("bad user login → 401", badLogin.status === 401, `got ${badLogin.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
