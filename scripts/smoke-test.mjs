#!/usr/bin/env node
/** HTTP smoke tests — run against `npm run dev` on localhost:3000 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;

function check(name, expected, actual) {
  const ok = actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${name} (${actual})`);
  if (ok) pass++;
  else fail++;
  return ok;
}

async function status(url, opts = {}) {
  const res = await fetch(url, opts);
  return res.status;
}

async function json(url, opts = {}) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

async function main() {
  const adminJar = new Map();
  const userJar = new Map();

  const withCookies = (jar) => (init = {}) => {
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    return { ...init, headers: { ...init.headers, ...(cookie ? { cookie } : {}) } };
  };
  const saveCookies = (jar, headers) => {
    const raw = headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      jar.set(k, v);
    }
  };

  // Pages
  check("GET /", 200, await status(`${BASE}/`));
  check("GET /m", 200, await status(`${BASE}/m`));
  check("GET /m/login", 200, await status(`${BASE}/m/login`));
  check("GET /m/auction", 200, await status(`${BASE}/m/auction`));
  check("GET /m/me", 200, await status(`${BASE}/m/me`));
  check("GET /m/drying", 200, await status(`${BASE}/m/drying`));
  check("GET /admin/login", 200, await status(`${BASE}/admin/login`));

  // Auth validation
  check("POST /api/auth/login empty", 400, await status(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }));
  check("POST /api/auth/admin/login empty", 400, await status(`${BASE}/api/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }));
  check("POST /api/auth/admin/login bad", 401, await status(`${BASE}/api/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "wrong" }),
  }));

  // Admin login
  const adminLogin = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  saveCookies(adminJar, adminLogin.headers);
  const adminBody = await adminLogin.json();
  check("POST /api/auth/admin/login ok", true, adminBody.ok === true);

  const adminOpts = withCookies(adminJar);
  check("GET /admin", 200, await status(`${BASE}/admin`, adminOpts()));
  check("GET /admin/assets", 200, await status(`${BASE}/admin/assets`, adminOpts()));
  check("GET /admin/auctions", 200, await status(`${BASE}/admin/auctions`, adminOpts()));
  check("GET /admin/drying", 200, await status(`${BASE}/admin/drying`, adminOpts()));
  check("GET /admin/dict", 200, await status(`${BASE}/admin/dict`, adminOpts()));

  check("POST /api/upload no auth", 401, await status(`${BASE}/api/upload`, { method: "POST" }));
  check("POST /api/upload no file", 400, await status(`${BASE}/api/upload`, adminOpts({ method: "POST" })));
  check("POST /api/admin/assets no auth", 401, await status(`${BASE}/api/admin/assets`, { method: "POST" }));
  check("POST /api/admin/assets no multipart", 400, await status(`${BASE}/api/admin/assets`, adminOpts({ method: "POST" })));

  const userLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  saveCookies(userJar, userLogin.headers);
  const userBody = await userLogin.json();
  check("POST /api/auth/login ok", true, userBody.ok === true);

  const userOpts = withCookies(userJar);
  check("POST /api/m/drying/reserve no auth", 401, await status(`${BASE}/api/m/drying/reserve`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }));
  check("POST /api/m/drying/reserve bad", 400, await status(`${BASE}/api/m/drying/reserve`, userOpts({
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  })));

  check("GET /api/dev/third-party-token", 200, await status(`${BASE}/api/dev/third-party-token?u_id=test123`));
  check("POST /api/auth/register empty", 400, await status(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }));

  // Auction bid validation
  check("POST bid no auth", 401, await status(`${BASE}/api/m/auction/fake/bid`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  }));

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
