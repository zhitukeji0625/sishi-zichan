#!/usr/bin/env node
/**
 * HTTP smoke tests for core flows. Requires dev/prod server on BASE_URL (default localhost:3000).
 * Usage: node scripts/smoke-test.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failed = 0;
function ok(msg) {
  console.log(`OK: ${msg}`);
}
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}

async function json(method, path, body, jar) {
  const headers = body ? { "Content-Type": "application/json" } : {};
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (jar) {
    for (const c of setCookie) jar.push(c.split(";")[0]);
  }
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* HTML */
  }
  return { status: res.status, data, headers: res.headers };
}

function cookieHeader(jar = []) {
  return jar.length ? { Cookie: jar.join("; ") } : {};
}

async function getStatus(path, jar = []) {
  const res = await fetch(`${BASE}${path}`, { headers: cookieHeader(jar) });
  return res.status;
}

async function main() {
  const userJar = [];
  const adminJar = [];

  for (const path of ["/", "/m", "/m/login", "/admin/login"]) {
    const s = await getStatus(path);
    s === 200 ? ok(`GET ${path}`) : fail(`GET ${path} -> ${s}`);
  }

  const login = await json("POST", "/api/auth/login", { phone: "13800138000", password: "user123" }, userJar);
  login.data.ok ? ok("user login") : fail(`user login: ${JSON.stringify(login.data)}`);

  const adminLogin = await json("POST", "/api/auth/admin/login", { phone: "13900000001", password: "admin123" }, adminJar);
  adminLogin.data.ok ? ok("admin login") : fail(`admin login: ${JSON.stringify(adminLogin.data)}`);

  const me = await getStatus("/m/me", userJar);
  me === 200 ? ok("GET /m/me") : fail(`/m/me -> ${me}`);

  const tokenRes = await json("GET", "/api/dev/third-party-token?u_id=smoke", null);
  const token = tokenRes.data.token;
  token ? ok("dev third-party token") : fail("missing dev token");

  const tp = await json("POST", "/api/auth/third-party", { token });
  tp.data.ok ? ok("third-party auth") : fail(`third-party: ${JSON.stringify(tp.data)}`);

  const bidDenied = await fetch(`${BASE}/api/m/auction/invalid/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 1 }),
  });
  bidDenied.status === 401 ? ok("bid requires auth") : fail(`bid unauth -> ${bidDenied.status}`);

  if (failed > 0) {
    process.exit(1);
  }
  console.log("\nSmoke tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
