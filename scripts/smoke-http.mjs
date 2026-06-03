#!/usr/bin/env node
/**
 * HTTP 冒烟测试：需已启动应用（dev 或 start）及 MariaDB 种子数据。
 * 用法：BASE_URL=http://localhost:3000 npm run test:smoke
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function req(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const jar = new Map();

  function cookieHeader() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  function storeCookies(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const [name, value] = pair.split("=");
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
  }

  console.log(`Smoke: ${BASE}`);

  let r = await req("/");
  assert(r.status === 200, `GET / -> ${r.status}`);

  r = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  storeCookies(r);
  assert(r.status === 200 && r.json.ok, "user login");

  r = await req("/m/auction", { headers: { Cookie: cookieHeader() } });
  assert(r.status === 200, "GET /m/auction");

  r = await req("/api/m/drying/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
    body: JSON.stringify({
      listingId: process.env.SMOKE_LISTING_ID ?? "",
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    }),
  });
  if (process.env.SMOKE_LISTING_ID) {
    assert(r.status === 200 && r.json.ok, `drying reserve: ${JSON.stringify(r.json)}`);
  } else {
    console.warn("  skip drying reserve (set SMOKE_LISTING_ID to enable)");
  }

  r = await req("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  storeCookies(r);
  assert(r.status === 200 && r.json.ok, "admin login");

  r = await req("/admin/assets", { headers: { Cookie: cookieHeader() }, redirect: "manual" });
  assert(r.status === 200 || r.status === 307, "admin assets");

  r = await req("/api/m/auction/test/bid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  assert(r.status === 401, "bid without auth -> 401");

  console.log("Smoke OK");
}

main().catch((e) => {
  console.error("Smoke failed:", e.message);
  process.exit(1);
});
