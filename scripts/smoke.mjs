#!/usr/bin/env node
/**
 * Smoke tests against a running dev/prod server.
 * Usage: BASE_URL=http://localhost:3000 node scripts/smoke.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`✓ ${name}`);
    pass++;
  } else {
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
    fail++;
  }
}

async function http(method, path, { jar, body, headers } = {}) {
  const opts = { method, headers: { ...headers } };
  if (jar) opts.headers.Cookie = jar;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, setCookie };
}

function mergeCookies(jar, setCookies) {
  const map = new Map();
  for (const part of (jar ?? "").split("; ").filter(Boolean)) {
    const [k, ...v] = part.split("=");
    if (k) map.set(k, v.join("="));
  }
  for (const sc of setCookies) {
    const [kv] = sc.split(";");
    const [k, ...v] = kv.split("=");
    if (k) map.set(k.trim(), v.join("="));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  console.log(`Smoke tests → ${BASE}\n`);

  // Static pages
  for (const path of ["/", "/m", "/m/login", "/m/register", "/m/auction", "/m/drying", "/m/me", "/m/sso", "/admin/login"]) {
    const r = await http("GET", path);
    check(`GET ${path}`, r.status === 200, `status ${r.status}`);
  }

  // Admin protected
  const adminRedirect = await http("GET", "/admin");
  check("GET /admin (no auth → redirect)", adminRedirect.status === 307, `status ${adminRedirect.status}`);

  // User login
  let userJar = "";
  const userLogin = await http("POST", "/api/auth/login", { body: { phone: "13800138000", password: "user123" } });
  userJar = mergeCookies(userJar, userLogin.setCookie);
  check("POST /api/auth/login", userLogin.json?.ok === true, userLogin.text);

  // Admin login
  let adminJar = "";
  const adminLogin = await http("POST", "/api/auth/admin/login", { body: { phone: "13900000001", password: "admin123" } });
  adminJar = mergeCookies(adminJar, adminLogin.setCookie);
  check("POST /api/auth/admin/login", adminLogin.json?.ok === true, adminLogin.text);

  // Dev third-party token
  const token = await http("GET", "/api/dev/third-party-token?u_id=smoke_test");
  check("GET /api/dev/third-party-token", token.status === 200 && token.json?.token, token.text);

  // Upload validation
  const uploadBad = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: adminJar, "Content-Type": "application/json" },
    body: "{}",
  });
  check("POST /api/upload (non-multipart → 400)", uploadBad.status === 400, `status ${uploadBad.status}`);

  const uploadEmpty = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: adminJar },
    body: new FormData(),
  });
  check("POST /api/upload (no file → 400)", uploadEmpty.status === 400, `status ${uploadEmpty.status}`);

  // Admin pages
  for (const path of ["/admin/dict", "/admin/assets", "/admin/auctions", "/admin/organizations", "/admin/drying", "/admin/announcements", "/admin/registrations"]) {
    const r = await http("GET", path, { jar: adminJar });
    check(`GET ${path}`, r.status === 200, `status ${r.status}`);
  }

  // Auction bid (requires LIVE project + approved registration)
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "asc" } });
  check("DB: dict categories seeded", (await prisma.dictCategory.count()) > 0);
  check("DB: demo auction is LIVE", project?.status === "LIVE", `status=${project?.status}`);

  if (project) {
    const bid = await http("POST", `/api/m/auction/${project.id}/bid`, { jar: userJar, body: { amount: 8200 } });
    check("POST /api/m/auction/:id/bid", bid.json?.ok === true, bid.text);

    // Duplicate deposit should 409
    const dupDeposit = await http("POST", "/api/m/payments/mock", {
      jar: userJar,
      body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id },
    });
    check("POST /api/m/payments/mock duplicate deposit → 409", dupDeposit.status === 409, `status ${dupDeposit.status}`);
  }

  await prisma.$disconnect();

  // Logout
  const logout = await http("POST", "/api/auth/logout", { jar: userJar });
  check("POST /api/auth/logout", logout.status === 200, `status ${logout.status}`);

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
