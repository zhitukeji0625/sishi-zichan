#!/usr/bin/env node
/**
 * HTTP 冒烟测试：需已启动 `npm run dev` 或 `npm start`，且数据库已 seed。
 * 用法：node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

async function jsonPost(path, body, cookieJar) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieJar ?? "" },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, setCookie };
}

function mergeCookies(jar, setCookie) {
  const map = new Map();
  for (const part of (jar || "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [k, ...v] = part.split("=");
    if (k) map.set(k, v.join("="));
  }
  for (const line of setCookie) {
    const [pair] = line.split(";");
    const [k, ...v] = pair.split("=");
    if (k) map.set(k.trim(), v.join("="));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  let userCookies = "";
  let adminCookies = "";

  const userLogin = await jsonPost("/api/auth/login", {
    phone: "13800138000",
    password: "user123",
  });
  if (userLogin.status !== 200 || !userLogin.data?.ok) {
    fail(`user login (${userLogin.status})`);
  } else {
    userCookies = mergeCookies("", userLogin.setCookie);
    ok("user login");
  }

  const adminLogin = await jsonPost("/api/auth/admin/login", {
    phone: "13900000001",
    password: "admin123",
  });
  if (adminLogin.status !== 200 || !adminLogin.data?.ok) {
    fail(`admin login (${adminLogin.status})`);
  } else {
    adminCookies = mergeCookies("", adminLogin.setCookie);
    ok("admin login");
  }

  for (const [path, cookies] of [
    ["/m/auction", userCookies],
    ["/admin/assets", adminCookies],
  ]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookies } });
    if (res.status !== 200) fail(`${path} (${res.status})`);
    else ok(`GET ${path}`);
  }

  const bad = await jsonPost("/api/auth/login", { phone: "13800138000", password: "wrong" });
  if (bad.status !== 401) fail(`bad password expected 401 got ${bad.status}`);
  else ok("bad password rejected");

  const liveRes = await fetch(`${BASE}/m/auction`, { headers: { Cookie: userCookies } });
  const html = await liveRes.text();
  if (!html.includes("进行中") && !html.includes("LIVE")) {
    console.warn("WARN: /m/auction may have no LIVE project visible (run npm run db:seed)");
  }

  if (failed) process.exit(1);
  console.log("Smoke tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
