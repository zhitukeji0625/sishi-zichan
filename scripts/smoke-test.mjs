import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";

async function req(path, opts = {}) {
  const url = path.startsWith("http") ? path : BASE + path;
  const res = await fetch(url, { redirect: "manual", ...opts });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  const cookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, text, json, cookies };
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

const loginRes = await req("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "13800138000", password: "user123" }),
});
const userCookies = loginRes.cookies.join("; ");

const adminLogin = await req("/api/auth/admin/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
});
const adminCookies = adminLogin.cookies.join("; ");

const prisma = new PrismaClient();
const project = await prisma.auctionProject.findFirst({
  where: { status: "LIVE" },
  orderBy: { createdAt: "desc" },
});
const listing = await prisma.dryingFieldListing.findFirst({
  where: { status: "OPERATING" },
  orderBy: { createdAt: "desc" },
});
const announcement = await prisma.announcement.findFirst({
  orderBy: { createdAt: "desc" },
});
let topBid = null;
if (project) {
  topBid = await prisma.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
}
await prisma.$disconnect();

if (project) {
  const r = await req(`/m/auction/${project.id}`, {
    headers: { Cookie: userCookies },
  });
  record(`GET /m/auction/${project.id}`, r.status === 200, `status=${r.status}`);

  const minBid = topBid
    ? Number(topBid.amount) + Number(project.bidStep)
    : Number(project.startPrice);

  const bid = await req(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookies },
    body: JSON.stringify({ amount: minBid }),
  });
  record(
    "POST bid on live auction",
    bid.status === 200 || bid.status === 201,
    `status=${bid.status} ${bid.text.slice(0, 100)}`,
  );

  const adminDetail = await req(`/admin/auctions/${project.id}`, {
    headers: { Cookie: adminCookies },
  });
  record(
    `GET /admin/auctions/${project.id}`,
    adminDetail.status === 200,
    `status=${adminDetail.status}`,
  );
} else {
  record("auction project exists", false, "no LIVE project");
}

if (listing) {
  const r = await req(`/m/drying/${listing.id}`);
  record(`GET /m/drying/${listing.id}`, r.status === 200, `status=${r.status}`);

  const reserve = await req("/api/m/drying/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookies },
    body: JSON.stringify({ listingId: listing.id }),
  });
  record(
    "POST drying reserve (auth check)",
    reserve.status !== 401,
    `status=${reserve.status} ${reserve.text.slice(0, 100)}`,
  );
} else {
  record("drying listing exists", false, "no OPEN listing");
}

if (announcement) {
  const r = await req(`/m/announcements/${announcement.id}`);
  record(
    `GET /m/announcements/${announcement.id}`,
    r.status === 200,
    `status=${r.status}`,
  );
}

const tokenRes = await req("/api/dev/third-party-token?u_id=smoke_test_user");
if (tokenRes.json?.token) {
  const sso = await req(
    `/m/sso?token=${encodeURIComponent(tokenRes.json.token)}`,
  );
  record(
    "GET /m/sso?token=...",
    sso.status === 200 || sso.status === 307,
    `status=${sso.status}`,
  );
}

const dupReg = await req("/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "13800138000", password: "user123", name: "dup" }),
});
record("POST register duplicate phone fails", dupReg.status >= 400, `status=${dupReg.status}`);

const badLogin = await req("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
});
record("POST bad password fails", badLogin.status >= 400, `status=${badLogin.status}`);

const assetsApi = await req("/api/admin/assets", {
  method: "POST",
  headers: { Cookie: adminCookies },
  body: new FormData(),
});
record(
  "POST /api/admin/assets (unauth body)",
  assetsApi.status === 400 || assetsApi.status === 401,
  `status=${assetsApi.status}`,
);

const logout = await req("/api/auth/logout", {
  method: "POST",
  headers: { Cookie: userCookies },
});
record("POST /api/auth/logout", logout.status === 200, `status=${logout.status}`);

const failed = results.filter((r) => !r.ok);
console.log("\n--- Summary ---");
console.log(
  `Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`,
);
if (failed.length) {
  console.log(
    "Failures:",
    failed.map((f) => `${f.name}: ${f.detail}`).join("\n"),
  );
  process.exit(1);
}
