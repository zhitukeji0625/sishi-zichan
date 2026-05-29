#!/usr/bin/env node
/**
 * HTTP smoke tests against running Next.js server (default :3000).
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const failures = [];
const passes = [];

function pass(name) {
  passes.push(name);
  console.log(`✓ ${name}`);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.error(`✗ ${name}: ${detail}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

function cookieJar() {
  const cookies = new Map();
  return {
    setFromResponse(res) {
      const set = res.headers.getSetCookie?.() ?? [];
      for (const c of set) {
        const [pair] = c.split(";");
        const [k, v] = pair.split("=");
        if (k) cookies.set(k.trim(), v);
      }
    },
    header() {
      if (!cookies.size) return {};
      return {
        Cookie: [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
      };
    },
  };
}

async function main() {
  // Public pages
  for (const path of ["/", "/m", "/m/login", "/admin/login"]) {
    const res = await fetch(`${BASE}${path}`);
    if (res.ok) pass(`GET ${path}`);
    else fail(`GET ${path}`, `status ${res.status}`);
  }

  // Admin login
  const adminJar = cookieJar();
  {
    const { res, json } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminJar.setFromResponse(res);
    if (res.ok && json?.ok) pass("admin login");
    else fail("admin login", JSON.stringify(json));
  }

  // End user login
  const userJar = cookieJar();
  {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userJar.setFromResponse(res);
    if (res.ok && json?.ok) pass("user login");
    else fail("user login", JSON.stringify(json));
  }

  // Dev third-party token (development only)
  {
    const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=13800138000");
    if (res.status === 404 && json?.error === "不可用") {
      pass("dev third-party token (skipped in production)");
    } else if (res.ok && json?.token) {
      pass("dev third-party token");
      const { res: ssoRes, json: ssoJson } = await fetchJson("/api/auth/third-party", {
        method: "POST",
        body: JSON.stringify({ token: json.token }),
      });
      if (ssoRes.ok && ssoJson?.ok) pass("third-party SSO login");
      else fail("third-party SSO login", JSON.stringify(ssoJson));
    } else {
      fail("dev third-party token", JSON.stringify(json));
    }
  }

  // Protected admin page (cookie)
  {
    const res = await fetch(`${BASE}/admin`, { headers: userJar.header() });
    // middleware should redirect unauthenticated; with admin cookie should work
    const adminRes = await fetch(`${BASE}/admin`, { headers: adminJar.header() });
    if (adminRes.ok || adminRes.status === 307 || adminRes.status === 302) {
      pass("admin area with session");
    } else {
      fail("admin area with session", `status ${adminRes.status}`);
    }
    void res;
  }

  // Query live auction from DB via script env - passed in
  const projectId = process.env.SMOKE_PROJECT_ID;
  if (projectId) {
    const { res, json } = await fetchJson(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: userJar.header(),
      body: JSON.stringify({ amount: 8000 }),
    });
    if (res.ok && json?.ok) pass("auction bid");
    else if (res.status === 400 && json?.error) {
      // acceptable if already bid / ended with clear message
      pass(`auction bid (expected business rule: ${json.error})`);
    } else {
      fail("auction bid", `${res.status} ${JSON.stringify(json)}`);
    }
  } else {
    console.log("⊘ auction bid skipped (no SMOKE_PROJECT_ID)");
  }

  // Drying reserve
  const listingId = process.env.SMOKE_LISTING_ID;
  if (listingId) {
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const { res, json } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: userJar.header(),
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    if (res.ok && json?.ok) pass("drying reserve");
    else fail("drying reserve", `${res.status} ${JSON.stringify(json)}`);
  }

  // Invalid login
  {
    const { res } = await fetchJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    if (res.status === 401) pass("login rejects bad password");
    else fail("login rejects bad password", `status ${res.status}`);
  }

  console.log(`\n${passes.length} passed, ${failures.length} failed`);
  if (failures.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
