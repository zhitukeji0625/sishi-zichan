/**
 * 功能冒烟测试：需 dev server 运行于 BASE_URL（默认 http://localhost:3000）
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function fetchCode(url: string, init?: RequestInit): Promise<number> {
  const res = await fetch(url, init);
  return res.status;
}

async function loginAdmin(): Promise<string> {
  const jar = new Map<string, string>();
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function loginUser(): Promise<string> {
  const jar = new Map<string, string>();
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  check("GET /", (await fetchCode(`${BASE}/`)) === 200);
  check("GET /admin/login", (await fetchCode(`${BASE}/admin/login`)) === 200);
  check("GET /m/login", (await fetchCode(`${BASE}/m/login`)) === 200);

  const adminCookie = await loginAdmin();
  const adminLogin = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  check("POST admin login", adminLogin.status === 200);

  check(
    "GET /admin/assets (authed)",
    (await fetchCode(`${BASE}/admin/assets`, { headers: { Cookie: adminCookie } })) === 200,
  );
  check(
    "GET /admin/assets/new",
    (await fetchCode(`${BASE}/admin/assets/new`, { headers: { Cookie: adminCookie } })) === 200,
  );
  check(
    "POST /api/admin/assets empty",
    (await fetchCode(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    })) === 400,
  );

  const userCookie = await loginUser();
  const userLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  check("POST user login", userLogin.status === 200);

  check("GET /m/auction", (await fetchCode(`${BASE}/m/auction`)) === 200);

  const project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });
  check("LIVE auction exists", !!project);
  if (project) {
    check(
      `GET /m/auction/${project.id}`,
      (await fetchCode(`${BASE}/m/auction/${project.id}`)) === 200,
    );
    const top = project.bids[0]?.amount;
    const minBid = top ? new Decimal(top).add(project.bidStep) : project.startPrice;
    const bidRes = await fetch(`${BASE}/api/m/auction/${project.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ amount: Number(minBid.toString()) }),
    });
    const bidJson = await bidRes.json().catch(() => ({}));
    check("POST bid", bidRes.status === 200 && bidJson.ok === true, JSON.stringify(bidJson));
  }

  check("GET /m/drying", (await fetchCode(`${BASE}/m/drying`)) === 200);

  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  check("drying listing exists", !!listing);
  if (listing) {
    const reserveRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: "2026-08-01",
        endDate: "2026-08-03",
      }),
    });
    check("POST drying reserve", reserveRes.status === 200);
  }

  if (project) {
    const payRes = await fetch(`${BASE}/api/m/payments/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: project.id }),
    });
    check("POST mock payment deposit (already paid)", payRes.status === 409);
  }

  check("GET third-party-token", (await fetchCode(`${BASE}/api/dev/third-party-token`)) === 200);
  check(
    "GET /admin/dict",
    (await fetchCode(`${BASE}/admin/dict`, { headers: { Cookie: adminCookie } })) === 200,
  );

  const dictCount = await prisma.dictCategory.count();
  check("dict categories seeded", dictCount > 0, `count=${dictCount}`);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
