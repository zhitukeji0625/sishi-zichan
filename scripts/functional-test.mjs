/**
 * Functional API smoke test — run with dev server on :3000
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function req(method, path, { body, cookies } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 200);
  }
  return { status: res.status, json, setCookie, location: res.headers.get("location") };
}

function mergeCookies(existing, setCookie) {
  const jar = new Map();
  for (const part of (existing ?? "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k && v) jar.set(k, v);
  }
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    if (k && v) jar.set(k.trim(), v);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const failures = [];

function assert(name, cond, detail = "") {
  if (!cond) {
    failures.push({ name, detail });
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`OK: ${name}`);
  }
}

async function main() {
  console.log("=== Auth ===");
  const login = await req("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
  });
  assert("user login", login.status === 200 && login.json?.ok);
  let userCookies = mergeCookies("", login.setCookie);

  const adminLogin = await req("POST", "/api/auth/admin/login", {
    body: { phone: "13900000001", password: "admin123" },
  });
  assert("admin login", adminLogin.status === 200 && adminLogin.json?.ok);
  let adminCookies = mergeCookies("", adminLogin.setCookie);

  console.log("\n=== Protected API without cookie ===");
  const bidNoAuth = await req("POST", "/api/m/auction/fake/bid", { body: { amount: 100 } });
  assert("bid requires auth", bidNoAuth.status === 401);

  console.log("\n=== Drying reserve ===");
  const { execSync } = await import("node:child_process");
  const listingId = execSync(
    `sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1"`,
    { encoding: "utf8" },
  ).trim();
  if (listingId) {
    const reserve = await req("POST", "/api/m/drying/reserve", {
      cookies: userCookies,
      body: {
        listingId,
        startDate: "2026-08-01",
        endDate: "2026-08-15",
      },
    });
    assert("drying reserve", reserve.status === 200 && reserve.json?.ok, JSON.stringify(reserve.json));
  } else {
    console.log("SKIP: no operating drying listing");
  }

  console.log("\n=== Auction bid ===");
  const projectId = execSync(
    `sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM AuctionProject LIMIT 1"`,
    { encoding: "utf8" },
  ).trim();
  if (projectId) {
    const bid = await req("POST", `/api/m/auction/${projectId}/bid`, {
      cookies: userCookies,
      body: { amount: 999999 },
    });
    assert("bid returns business error when not LIVE", bid.status === 400, JSON.stringify(bid.json));
  }

  console.log("\n=== Dev third-party token ===");
  const tpt = await req("GET", "/api/dev/third-party-token?u_id=demo_functional_test");
  assert("third-party token", tpt.status === 200 && tpt.json?.token);

  console.log("\n=== Admin assets API ===");
  const assetsList = await req("GET", "/api/admin/assets", { cookies: adminCookies });
  assert("admin assets list or method", assetsList.status === 200 || assetsList.status === 405);

  console.log("\n=== Pages (status) ===");
  for (const path of ["/", "/m/auction", "/admin/login"]) {
    const r = await fetch(`${BASE}${path}`);
    assert(`GET ${path}`, r.status === 200);
  }

  if (failures.length) {
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll functional checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
