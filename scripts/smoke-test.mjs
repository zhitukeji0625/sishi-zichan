#!/usr/bin/env node
/**
 * 本地冒烟测试：需已启动 `npm run start` 且数据库已 seed。
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json, headers: res.headers };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const failures = [];

  async function check(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      failures.push(`${name}: ${e.message}`);
      console.error(`✗ ${name}: ${e.message}`);
    }
  }

  await check("GET /", async () => {
    const r = await request("/");
    assert(r.status === 200, `status ${r.status}`);
  });

  await check("GET /m/login", async () => {
    const r = await request("/m/login");
    assert(r.status === 200, `status ${r.status}`);
  });

  await check("POST /api/auth/login (tenant)", async () => {
    const r = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    assert(r.json?.ok === true, r.text);
  });

  await check("POST /api/auth/login (bad password)", async () => {
    const r = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    assert(r.status === 401 && r.json?.error, r.text);
  });

  await check("POST /api/auth/admin/login", async () => {
    const r = await request("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    assert(r.json?.ok === true, r.text);
  });

  await check("GET /admin/assets (no cookie → redirect)", async () => {
    const r = await fetch(`${BASE}/admin/assets`, { redirect: "manual" });
    assert(r.status === 307 || r.status === 302, `status ${r.status}`);
  });

  if (failures.length) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
