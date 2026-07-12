#!/usr/bin/env node
/**
 * API / page smoke tests — requires dev server on BASE_URL (default http://localhost:3000).
 * Run: npm run db:seed && npm run dev  (in another terminal)  then  npm run smoke
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`PASS ${name}`);
    pass++;
  } else {
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

async function json(method, path, body, cookieJar) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
    headers: { ...headers, Cookie: cookieJar ?? "" },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

function mergeCookies(jar, setCookie) {
  const parts = jar ? jar.split("; ").filter(Boolean) : [];
  const map = new Map(parts.map((p) => p.split("=")).map(([k, ...v]) => [k, v.join("=")]));
  for (const raw of setCookie ?? []) {
    const [pair] = raw.split(";");
    const [k, ...v] = pair.split("=");
    map.set(k.trim(), v.join("="));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    redirect: "manual",
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const data = await res.json();
  const jar = mergeCookies("", cookies);
  return { status: res.status, data, jar };
}

async function loginUser() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    redirect: "manual",
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const data = await res.json();
  const jar = mergeCookies("", cookies);
  return { status: res.status, data, jar };
}

async function main() {
  // Health / pages
  for (const path of ["/", "/admin/login", "/m", "/m/login", "/m/auction", "/m/drying"]) {
    const res = await fetch(`${BASE}${path}`);
    check(`GET ${path}`, res.status === 200, String(res.status));
  }

  const admin = await loginAdmin();
  check("admin login", admin.status === 200 && admin.data?.ok === true, JSON.stringify(admin.data));

  const user = await loginUser();
  check("user login", user.status === 200 && user.data?.ok === true, JSON.stringify(user.data));

  // Admin dict page (requires auth)
  const dictPage = await fetch(`${BASE}/admin/dict`, {
    headers: { Cookie: admin.jar },
    redirect: "manual",
  });
  check("GET /admin/dict (auth)", dictPage.status === 200, String(dictPage.status));

  // Third-party token
  const tokenRes = await fetch(`${BASE}/api/dev/third-party-token?u_id=smoke-test`);
  const tokenData = await tokenRes.json();
  check("GET /api/dev/third-party-token", tokenRes.status === 200 && tokenData.token, JSON.stringify(tokenData));

  // Upload: non-multipart → 400
  const uploadBad = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.jar },
    body: "{}",
  });
  check("POST /api/upload non-multipart", uploadBad.status === 400, String(uploadBad.status));

  // Upload: no file → 400
  const form = new FormData();
  const uploadNoFile = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: admin.jar },
    body: form,
  });
  check("POST /api/upload no file", uploadNoFile.status === 400, String(uploadNoFile.status));

  // Upload: unauthenticated → 401
  const uploadUnauth = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  check("POST /api/upload unauth", uploadUnauth.status === 401, String(uploadUnauth.status));

  const prisma = new PrismaClient();
  const project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  const listing = await prisma.dryingFieldListing.findFirst();
  const dictCount = await prisma.dictCategory.count();
  await prisma.$disconnect();

  check("dict categories seeded", dictCount >= 10, String(dictCount));
  check("demo auction LIVE", project?.status === "LIVE", project?.status ?? "none");

  // Auction bid
  if (project) {
    const bidRes = await json("POST", `/api/m/auction/${project.id}/bid`, { amount: 8000 }, user.jar);
    check("auction bid", bidRes.status === 200 && bidRes.data?.ok === true, JSON.stringify(bidRes.data));

    // Duplicate bid below min → 400
    const bidLow = await json("POST", `/api/m/auction/${project.id}/bid`, { amount: 8100 }, user.jar);
    check("auction bid too low", bidLow.status === 400, JSON.stringify(bidLow.data));
  } else {
    check("auction bid", false, "no project");
    check("auction bid too low", false, "no project");
  }

  // Mock payment duplicate deposit → 409
  if (project) {
    const payDup = await json(
      "POST",
      "/api/m/payments/mock",
      { purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id },
      user.jar,
    );
    check("mock payment duplicate deposit", payDup.status === 409, JSON.stringify(payDup.data));
  } else {
    check("mock payment duplicate deposit", false, "no project");
  }

  // Drying reserve
  if (listing) {
    const start = new Date();
    start.setDate(start.getDate() + 2);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const reserve = await json(
      "POST",
      "/api/m/drying/reserve",
      {
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
      user.jar,
    );
    check("drying reserve", reserve.status === 200 && reserve.data?.ok === true, JSON.stringify(reserve.data));
  } else {
    check("drying reserve", false, "no listing");
  }

  // Auth guards
  const bidUnauth = await json("POST", `/api/m/auction/${project?.id ?? "x"}/bid`, { amount: 8000 });
  check("bid unauth", bidUnauth.status === 401, String(bidUnauth.status));

  const adminLoginBad = await json("POST", "/api/auth/admin/login", { phone: "13900000001", password: "wrong" });
  check("admin login bad password", adminLoginBad.status === 401, String(adminLoginBad.status));

  // Logout
  const logoutAdmin = await fetch(`${BASE}/api/auth/admin/logout`, {
    method: "POST",
    headers: { Cookie: admin.jar },
  });
  check("admin logout", logoutAdmin.status === 200, String(logoutAdmin.status));

  const logoutUser = await fetch(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: user.jar },
  });
  check("user logout", logoutUser.status === 200, String(logoutUser.status));

  // Register validation
  const regBad = await json("POST", "/api/auth/register", { phone: "123", password: "x" });
  check("register invalid", regBad.status === 400, String(regBad.status));

  console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
