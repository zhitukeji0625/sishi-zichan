#!/usr/bin/env node
/**
 * HTTP smoke test for sishi-zichan (requires dev server on BASE_URL)
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ name, msg });
    console.log(`✗ ${name}: ${msg}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function jsonPost(path, body, cookies = "") {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

async function get(path, cookies = "") {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookies ? { Cookie: cookies } : {},
    redirect: "manual",
  });
  return { status: res.status, headers: res.headers };
}

function extractCookies(setCookie) {
  if (!setCookie) return "";
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  // 1. Homepage
  await test("GET / returns 200", async () => {
    const { status } = await get("/");
    assert(status === 200, `expected 200, got ${status}`);
  });

  // 2. Mobile pages
  for (const path of ["/m", "/m/auction", "/m/drying", "/m/orders", "/m/me", "/m/login"]) {
    await test(`GET ${path} returns 200`, async () => {
      const { status } = await get(path);
      assert(status === 200, `expected 200, got ${status}`);
    });
  }

  // 3. Admin login page
  await test("GET /admin/login returns 200", async () => {
    const { status } = await get("/admin/login");
    assert(status === 200, `expected 200, got ${status}`);
  });

  // 4. Admin redirect without auth
  await test("GET /admin redirects to login (307)", async () => {
    const { status } = await get("/admin");
    assert(status === 307 || status === 302, `expected redirect, got ${status}`);
  });

  // 5. User registration duplicate
  await test("POST /api/auth/register duplicate phone returns 409", async () => {
    const { status } = await jsonPost("/api/auth/register", {
      phone: "13800138000",
      password: "user123",
      name: "重复用户",
    });
    assert(status === 409, `expected 409, got ${status}`);
  });

  // 6. User login
  let userCookies = "";
  await test("POST /api/auth/login succeeds", async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    userCookies = extractCookies(res.headers.getSetCookie?.() ?? res.headers.raw?.()?.["set-cookie"]);
  });

  // 7. Admin login
  let adminCookies = "";
  await test("POST /api/auth/admin/login succeeds", async () => {
    const res = await fetch(`${BASE}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    adminCookies = extractCookies(res.headers.getSetCookie?.() ?? res.headers.raw?.()?.["set-cookie"]);
  });

  // 8. Upload without multipart returns 400
  await test("POST /api/upload non-multipart returns 400", async () => {
    const res = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({ file: "test" }),
    });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  // 9. Asset create without multipart returns 400
  await test("POST /api/admin/assets non-multipart returns 400", async () => {
    const res = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({ name: "test" }),
    });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  // 10. Dev third-party token
  await test("GET /api/dev/third-party-token returns 200", async () => {
    const { status } = await get("/api/dev/third-party-token?u_id=test123");
    assert(status === 200, `expected 200, got ${status}`);
  });

  // 11. Drying reserve without auth returns 401
  await test("POST /api/m/drying/reserve without auth returns 401", async () => {
    const { status } = await jsonPost("/api/m/drying/reserve", {
      listingId: "fake",
      startDate: "2026-09-10",
      endDate: "2026-09-15",
    });
    assert(status === 401, `expected 401, got ${status}`);
  });

  // 12. Drying reserve with auth (need real listingId)
  await test("POST /api/m/drying/reserve with auth", async () => {
    // Get listing from page - we'll use prisma via a workaround: try with invalid id first
    const { status, data } = await jsonPost(
      "/api/m/drying/reserve",
      { listingId: "invalid-id", startDate: "2026-09-10", endDate: "2026-09-15" },
      userCookies,
    );
    // Should be 404 or 400, not 500
    assert(status !== 500, `unexpected 500: ${JSON.stringify(data)}`);
    assert([400, 404].includes(status), `expected 400/404, got ${status}`);
  });

  // 13. Admin pages with auth
  for (const path of ["/admin", "/admin/assets", "/admin/auctions", "/admin/drying", "/admin/dict"]) {
    await test(`GET ${path} with admin auth returns 200`, async () => {
      const { status } = await get(path, adminCookies);
      assert(status === 200, `expected 200, got ${status}`);
    });
  }

  // 14. Invalid login
  await test("POST /api/auth/login wrong password returns 401", async () => {
    const { status } = await jsonPost("/api/auth/login", {
      phone: "13800138000",
      password: "wrongpassword",
    });
    assert(status === 401, `expected 401, got ${status}`);
  });

  // 15. Register with short password
  await test("POST /api/auth/register short password returns 400", async () => {
    const { status } = await jsonPost("/api/auth/register", {
      phone: "19999999999",
      password: "123",
      name: "测试",
    });
    assert(status === 400, `expected 400, got ${status}`);
  });

  // 16. Auction bid without auth
  await test("POST /api/m/auction/fake/bid without auth returns 401", async () => {
    const { status } = await jsonPost("/api/m/auction/fake/bid", { amount: 100 });
    assert(status === 401, `expected 401, got ${status}`);
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (errors.length) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e.name}: ${e.msg}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
