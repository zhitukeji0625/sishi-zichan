#!/usr/bin/env node
/**
 * HTTP smoke tests for sishi-zichan (run against npm run dev)
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) {
  passed++;
  console.log(`✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  errors.push({ name, detail });
  console.log(`✗ ${name}: ${detail}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { res, json, text };
}

function getCookie(res) {
  const setCookie = res.headers.getSetCookie?.() || [];
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`Smoke tests against ${BASE}\n`);

  // 1. Homepage
  {
    const res = await fetch(`${BASE}/`);
    if (res.ok) ok("GET /");
    else fail("GET /", `status ${res.status}`);
  }

  // 2. Admin login page
  {
    const res = await fetch(`${BASE}/admin/login`);
    if (res.ok) ok("GET /admin/login");
    else fail("GET /admin/login", `status ${res.status}`);
  }

  // 3. Admin redirect when not logged in
  {
    const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
    if (res.status === 307 || res.status === 302) ok("GET /admin redirects (307/302)");
    else fail("GET /admin redirects", `status ${res.status}`);
  }

  // 4. Mobile pages
  for (const path of ["/m", "/m/me", "/m/auction", "/m/drying"]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.ok) ok(`GET ${path}`);
    else fail(`GET ${path}`, `status ${res.status}`);
  }

  // 5. Admin login API
  let adminCookie = "";
  {
    const { res, json } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminCookie = getCookie(res);
    if (res.ok && json.ok) ok("POST /api/auth/admin/login");
    else fail("POST /api/auth/admin/login", JSON.stringify(json));
  }

  // 6. Upload non-multipart returns 400
  {
    const { res, json } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    if (res.status === 400) ok("POST /api/upload non-multipart → 400");
    else fail("POST /api/upload non-multipart", `status ${res.status} ${JSON.stringify(json)}`);
  }

  // 7. Asset create non-multipart returns 400
  {
    const { res, json } = await fetchJson("/api/admin/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    if (res.status === 400) ok("POST /api/admin/assets non-multipart → 400");
    else fail("POST /api/admin/assets non-multipart", `status ${res.status} ${JSON.stringify(json)}`);
  }

  // 8. User login
  let userCookie = "";
  {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userCookie = getCookie(res);
    if (res.ok && json.ok) ok("POST /api/auth/login");
    else fail("POST /api/auth/login", JSON.stringify(json));
  }

  // 9. Duplicate registration returns 409
  {
    const { res, json } = await fetchJson("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123", name: "test" }),
    });
    if (res.status === 409) ok("POST /api/auth/register duplicate → 409");
    else fail("POST /api/auth/register duplicate", `status ${res.status} ${JSON.stringify(json)}`);
  }

  // 10. Third-party token (dev only)
  {
    const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=test-user");
    if (res.ok && json.token) ok("GET /api/dev/third-party-token");
    else fail("GET /api/dev/third-party-token", `status ${res.status} ${JSON.stringify(json)}`);
  }

  // 11. Drying reservation - invalid listing tests auth + validation
  {
    const { res, json } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId: "invalid-id",
        startDate: "2026-10-01",
        endDate: "2026-10-03",
      }),
    });
    if (res.status === 404) ok("POST /api/m/drying/reserve invalid listing → 404");
    else if (res.status === 400) ok("POST /api/m/drying/reserve (validation)");
    else fail("POST /api/m/drying/reserve", `status ${res.status} ${JSON.stringify(json)}`);
  }

  // 12. Bid without login → 401
  {
    const { res, json } = await fetchJson("/api/m/auction/fake-id/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    if (res.status === 401) ok("POST bid without login → 401");
    else fail("POST bid without login", `status ${res.status}`);
  }

  // 13. Bid with login (need live auction project)
  {
    const auctionsRes = await fetch(`${BASE}/m/auction`);
    if (!auctionsRes.ok) {
      fail("GET /m/auction for bid test", `status ${auctionsRes.status}`);
    } else {
    const html = await auctionsRes.text();
    const projectMatch = html.match(/\/m\/auction\/([a-z0-9]+)/i);
    if (projectMatch) {
      const projectId = projectMatch[1];
      const { res, json } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userCookie },
        body: JSON.stringify({ amount: 999999 }),
      });
      if (res.ok && json.ok) ok(`POST bid on project ${projectId}`);
      else if (res.status === 400) ok(`POST bid on project ${projectId} (business rule: ${json.error})`);
      else fail(`POST bid on project ${projectId}`, `status ${res.status} ${JSON.stringify(json)}`);
    } else {
      console.log("⚠ No live auction found on /m/auction - skipping bid test");
    }
    }
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (errors.length) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e.name}: ${e.detail}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
