/**
 * End-to-end API flow test against running dev server + DB.
 * Run: npx tsx scripts/e2e-flow-test.ts
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

let failures = 0;

function ok(name: string) {
  console.log(`OK: ${name}`);
}

function fail(name: string, detail: string) {
  console.log(`FAIL: ${name} — ${detail}`);
  failures++;
}

async function jsonFetch(
  path: string,
  init?: RequestInit & { cookies?: string },
): Promise<{ status: number; body: unknown; setCookie?: string }> {
  const headers = new Headers(init?.headers);
  if (init?.cookies) headers.set("Cookie", init.cookies);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { status: res.status, body, setCookie: res.headers.get("set-cookie") ?? undefined };
}

function mergeCookies(existing: string, setCookie?: string): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [k, ...v] = part.split("=");
    if (k) jar.set(k, v.join("="));
  }
  if (setCookie) {
    const first = setCookie.split(";")[0];
    const [k, ...v] = first.split("=");
    if (k) jar.set(k.trim(), v.join("="));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  let cookies = "";

  // Login
  const login = await jsonFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  if (login.status === 200 && (login.body as { ok?: boolean }).ok) {
    ok("user login");
    cookies = mergeCookies(cookies, login.setCookie);
  } else fail("user login", JSON.stringify(login));

  // Prepare LIVE auction
  const asset = await prisma.asset.findFirst();
  const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!asset || !user) {
    fail("setup", "missing seed asset or user");
    process.exit(1);
  }

  const project = await prisma.auctionProject.create({
    data: {
      code: `E2E${Date.now()}`,
      assetId: asset.id,
      startPrice: new Decimal(1000),
      bidStep: new Decimal(100),
      depositAmount: new Decimal(50),
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "LIVE",
    },
  });

  await prisma.auctionRegistration.upsert({
    where: { projectId_endUserId: { projectId: project.id, endUserId: user.id } },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: project.id,
      endUserId: user.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });

  const bid = await jsonFetch(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ amount: 1000 }),
    cookies,
  });
  if (bid.status === 200 && (bid.body as { ok?: boolean }).ok) ok("place bid");
  else fail("place bid", JSON.stringify(bid));

  const bid2 = await jsonFetch(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ amount: 1050 }),
    cookies,
  });
  if (bid2.status === 400) ok("reject low bid increment");
  else fail("reject low bid increment", `expected 400, got ${bid2.status}: ${JSON.stringify(bid2.body)}`);

  const bid3 = await jsonFetch(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ amount: 1100 }),
    cookies,
  });
  if (bid3.status === 200 && (bid3.body as { ok?: boolean }).ok) ok("second valid bid");
  else fail("second valid bid", JSON.stringify(bid3));

  // Drying reserve
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const reserve = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: "2026-07-01",
        endDate: "2026-07-03",
      }),
      cookies,
    });
    if (reserve.status === 200 && (reserve.body as { ok?: boolean }).ok) {
      ok("drying reserve");
      const resId = (reserve.body as { id: string }).id;
      const pay = await jsonFetch("/api/m/payments/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ purpose: "DRYING_DEPOSIT", reservationId: resId }),
        cookies,
      });
      if (pay.status === 400 && String((pay.body as { error?: string }).error).includes("不可支付")) {
        ok("drying deposit blocked before approval (expected)");
      } else if (pay.status === 200) {
        ok("drying deposit payment");
      } else {
        fail("drying deposit", JSON.stringify(pay));
      }
    } else fail("drying reserve", JSON.stringify(reserve));
  }

  // Register new user
  const phone = `199${Date.now().toString().slice(-8)}`;
  const reg = await jsonFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: "testpass1", name: "E2E用户" }),
  });
  if (reg.status === 200 && (reg.body as { ok?: boolean }).ok) ok("register new user");
  else fail("register", JSON.stringify(reg));

  // Cleanup test project
  await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionRegistration.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionProject.delete({ where: { id: project.id } });
  await prisma.endUser.deleteMany({ where: { phone } });

  console.log(failures === 0 ? "\nAll E2E flow checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
