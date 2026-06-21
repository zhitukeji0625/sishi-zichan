#!/usr/bin/env node
/**
 * 功能完整性冒烟测试（需 dev/prod 服务运行于 BASE_URL）
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;

function check(name, ok) {
  if (ok) {
    console.log(`✓ ${name}`);
    pass++;
  } else {
    console.log(`✗ ${name}`);
    fail++;
  }
}

async function loginUser() {
  const jar = {};
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    jar[k] = v;
  }
  const body = await res.json();
  return { ok: body.ok === true, cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") };
}

async function loginAdmin() {
  const jar = {};
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    jar[k] = v;
  }
  const body = await res.json();
  return { ok: body.ok === true, cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") };
}

async function get(path, cookie) {
  const headers = cookie ? { Cookie: cookie } : {};
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  return res.status;
}

async function postJson(path, body, cookie) {
  const headers = { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) };
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`=== Functional smoke test @ ${BASE} ===\n`);

  check("Portal /", (await get("/")) === 200);
  check("Admin login page", (await get("/admin/login")) === 200);
  check("Mobile H5 /m", (await get("/m")) === 200);
  check("Admin redirect (no auth)", (await get("/admin")) === 307);

  const admin = await loginAdmin();
  check("Admin login API", admin.ok);
  check("Admin dashboard", (await get("/admin", admin.cookie)) === 200);
  check("Admin assets", (await get("/admin/assets", admin.cookie)) === 200);
  check("Admin auctions", (await get("/admin/auctions", admin.cookie)) === 200);
  check("Admin drying", (await get("/admin/drying", admin.cookie)) === 200);

  const emptyAssets = await fetch(`${BASE}/api/admin/assets`, {
    method: "POST",
    headers: { Cookie: admin.cookie },
  });
  check("Admin assets empty POST → 400", emptyAssets.status === 400);

  const user = await loginUser();
  check("User login API", user.ok);
  check("Mobile me", (await get("/m/me", user.cookie)) === 200);
  check("Mobile auction", (await get("/m/auction", user.cookie)) === 200);
  check("Mobile orders", (await get("/m/orders", user.cookie)) === 200);

  const tp = await fetch(`${BASE}/api/dev/third-party-token?u_id=func-test`);
  const tpBody = await tp.json();
  check("Third-party token", typeof tpBody.token === "string" && tpBody.token.length > 10);

  const tpAuth = await postJson("/api/auth/third-party", { token: tpBody.token });
  check("Third-party auth", tpAuth.body.ok === true);

  console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
