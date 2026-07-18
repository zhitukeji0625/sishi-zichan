const BASE = "http://localhost:3000";
let passed = 0;
let failed = 0;
const fails = [];

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    fails.push({ name, detail });
    console.log(`✗ ${name}: ${detail}`);
  }
}

async function req(method, path, { body, headers, cookie } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body:
      body instanceof FormData
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
    redirect: "manual",
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  const setCookie = r.headers.getSetCookie?.() ?? [];
  return { status: r.status, json, text, cookies: setCookie };
}

for (const p of [
  "/",
  "/m",
  "/m/login",
  "/m/register",
  "/m/auction",
  "/m/drying",
  "/admin/login",
]) {
  const r = await req("GET", p);
  ok(`GET ${p}`, r.status === 200, `status=${r.status}`);
}

const t = await req("GET", "/api/dev/third-party-token?u_id=testuser");
ok(
  "GET third-party-token",
  t.status === 200 && t.json?.token,
  JSON.stringify(t.json),
);

const badLogin = await req("POST", "/api/auth/login", {
  body: { phone: "13800138000", password: "wrong" },
});
ok("POST login wrong password", badLogin.status === 401, `status=${badLogin.status}`);

const login = await req("POST", "/api/auth/login", {
  body: { phone: "13800138000", password: "user123" },
});
const userCookie = login.cookies.map((c) => c.split(";")[0]).join("; ");
ok(
  "POST login success",
  login.status === 200 && login.json?.ok,
  JSON.stringify(login.json),
);

const adminLogin = await req("POST", "/api/auth/admin/login", {
  body: { phone: "13900000001", password: "admin123" },
});
const adminCookie = adminLogin.cookies
  .map((c) => c.split(";")[0])
  .join("; ");
ok(
  "POST admin login",
  adminLogin.status === 200 && adminLogin.json?.ok,
  JSON.stringify(adminLogin.json),
);

const upNoAuth = await req("POST", "/api/upload", {
  body: JSON.stringify({}),
  headers: { "Content-Type": "application/json" },
});
ok("POST upload no auth", upNoAuth.status === 401, `status=${upNoAuth.status}`);

const upBad = await req("POST", "/api/upload", {
  body: JSON.stringify({}),
  headers: { "Content-Type": "application/json" },
  cookie: adminCookie,
});
ok(
  "POST upload non-multipart",
  upBad.status === 400,
  `status=${upBad.status} body=${upBad.text.slice(0, 100)}`,
);

const bidNoAuth = await req("POST", "/api/m/auction/fake/bid", {
  body: { amount: 1000 },
});
ok("POST bid no auth", bidNoAuth.status === 401, `status=${bidNoAuth.status}`);

const payBad = await req("POST", "/api/m/payments/mock", {
  body: { purpose: "INVALID" },
  cookie: userCookie,
});
ok(
  "POST mock payment invalid",
  payBad.status === 400,
  `status=${payBad.status}`,
);

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const project = await prisma.auctionProject.findFirst({
  orderBy: { createdAt: "desc" },
});
const listing = await prisma.dryingFieldListing.findFirst({
  where: { status: "OPERATING" },
});

if (project) {
  const payDup = await req("POST", "/api/m/payments/mock", {
    body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id },
    cookie: userCookie,
  });
  ok(
    "POST mock payment duplicate deposit",
    payDup.status === 409,
    `status=${payDup.status} ${JSON.stringify(payDup.json)}`,
  );

  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const minNext = topBid
    ? Number(topBid.amount) + Number(project.bidStep)
    : Number(project.startPrice);
  const bid = await req("POST", `/api/m/auction/${project.id}/bid`, {
    body: { amount: minNext },
    cookie: userCookie,
  });
  const expectBidOk = project.status === "LIVE";
  ok(
    `POST bid (${project.status})`,
    expectBidOk ? bid.status === 200 && bid.json?.ok : bid.status === 400,
    `status=${bid.status} ${JSON.stringify(bid.json)}`,
  );
} else {
  ok("auction project exists", false, "no project");
}

ok(
  "auction project LIVE",
  project?.status === "LIVE",
  `status=${project?.status ?? "missing"}`,
);

if (listing) {
  const reserve = await req("POST", "/api/m/drying/reserve", {
    body: {
      listingId: listing.id,
      startDate: "2026-08-01",
      endDate: "2026-08-03",
    },
    cookie: userCookie,
  });
  ok(
    "POST drying reserve",
    reserve.status === 200 && reserve.json?.ok,
    `status=${reserve.status} ${JSON.stringify(reserve.json)}`,
  );
}

const regDup = await req("POST", "/api/auth/register", {
  body: { phone: "13800138000", password: "user123" },
});
ok("POST register duplicate", regDup.status === 409, `status=${regDup.status}`);

const assetNoAuth = await req("POST", "/api/admin/assets", {
  body: new FormData(),
});
ok(
  "POST admin assets no auth",
  assetNoAuth.status === 401,
  `status=${assetNoAuth.status}`,
);

if (t.json?.token) {
  const sso = await req("POST", "/api/auth/third-party", {
    body: { token: t.json.token },
  });
  ok(
    "POST third-party auth",
    sso.status === 200 && sso.json?.ok,
    `status=${sso.status}`,
  );
}

const dictCount = await prisma.dictCategory.count();
ok("dict categories seeded", dictCount > 0, `count=${dictCount}`);

for (const p of [
  "/admin",
  "/admin/assets",
  "/admin/auctions",
  "/admin/drying",
  "/admin/dict",
  "/admin/announcements",
  "/admin/registrations",
  "/admin/organizations",
  "/admin/admins",
  "/admin/audit",
  "/admin/config",
]) {
  const r = await req("GET", p, { cookie: adminCookie });
  ok(`GET ${p} (admin)`, r.status === 200, `status=${r.status}`);
}

for (const p of ["/m/me", "/m/orders"]) {
  const r = await req("GET", p, { cookie: userCookie });
  ok(`GET ${p} (user)`, r.status === 200, `status=${r.status}`);
}

if (project) {
  const r = await req("GET", `/m/auction/${project.id}`, { cookie: userCookie });
  ok("GET /m/auction/[id]", r.status === 200, `status=${r.status}`);
}

if (listing) {
  const r = await req("GET", `/m/drying/${listing.id}`, { cookie: userCookie });
  ok("GET /m/drying/[id]", r.status === 200, `status=${r.status}`);
}

const ann = await prisma.announcement.findFirst({ where: { status: "PUBLISHED" } });
if (ann) {
  const r = await req("GET", `/m/announcements/${ann.id}`);
  ok("GET /m/announcements/[id]", r.status === 200, `status=${r.status}`);
}

const logout = await req("POST", "/api/auth/logout", { cookie: userCookie });
ok("POST logout", logout.status === 200, `status=${logout.status}`);

await prisma.$disconnect();
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (fails.length) console.log(JSON.stringify(fails, null, 2));
process.exit(failed > 0 ? 1 : 0);
