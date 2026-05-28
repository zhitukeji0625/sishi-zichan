#!/usr/bin/env node
/**
 * HTTP 冒烟测试：需已启动 dev/prod 服务并完成 db:seed。
 * 用法：BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function req(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, json, text };
}

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[smoke] OK: ${msg}`);
}

const jar = { user: "", admin: "" };

function cookieHeader(jarValue) {
  return jarValue ? { Cookie: jarValue } : {};
}

async function main() {
  // 门户与登录页
  for (const path of ["/", "/m", "/admin/login"]) {
    const { res } = await req(path);
    if (res.status !== 200) fail(`${path} -> ${res.status}`);
  }
  ok("public pages");

  // 用户登录
  let r = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  if (!r.res.ok || !r.json?.ok) fail(`user login: ${r.text.slice(0, 120)}`);
  jar.user = r.res.headers.getSetCookie?.()?.join("; ") ?? r.res.headers.get("set-cookie") ?? "";
  ok("user login");

  // 管理端登录
  r = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  if (!r.res.ok || !r.json?.ok) fail(`admin login: ${r.text.slice(0, 120)}`);
  jar.admin = r.res.headers.getSetCookie?.()?.join("; ") ?? r.res.headers.get("set-cookie") ?? "";
  ok("admin login");

  // 受保护页面
  for (const path of ["/m/auction", "/m/drying", "/m/me", "/admin/assets", "/admin/dict"]) {
    const cookies = path.startsWith("/admin") ? jar.admin : jar.user;
    const { res } = await req(path, { headers: cookieHeader(cookies) });
    if (res.status !== 200) fail(`${path} -> ${res.status}`);
  }
  ok("authenticated pages");

  // 第三方 token
  r = await req("/api/dev/third-party-token?u_id=smoke-ext");
  if (!r.res.ok || !r.json?.token) fail("third-party-token");
  r = await req("/api/auth/third-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: r.json.token }),
  });
  if (!r.res.ok || !r.json?.ok) fail(`third-party auth: ${r.text.slice(0, 120)}`);
  ok("third-party auth");

  console.log("[smoke] All checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
