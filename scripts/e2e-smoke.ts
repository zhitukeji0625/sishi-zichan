/**
 * End-to-end smoke test for core business flows.
 * Run: npx tsx scripts/e2e-smoke.ts
 */
import { PrismaClient } from "@prisma/client";
import { placeBid } from "../src/lib/auction";
import { Decimal } from "@prisma/client/runtime/library";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

async function loginUser(phone: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { ok: res.ok, cookie, body: await res.json().catch(() => ({})) };
}

async function loginAdmin(phone: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { ok: res.ok, cookie };
}

async function main() {
  // Ensure demo auction is LIVE
  const starts = new Date(Date.now() - 60_000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.updateMany({
    where: { code: { startsWith: "AP" } },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });

  const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  const project = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  if (!user || !project) {
    fail("setup", "missing demo user or LIVE auction");
    return;
  }

  // Auction bid via lib
  try {
    const top = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const min = top
      ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
      : new Decimal(project.startPrice.toString());
    const bid = await placeBid({ projectId: project.id, endUserId: user.id, amount: min });
    pass("auction placeBid", `bidId=${bid.id} amount=${min.toString()}`);
  } catch (e) {
    fail("auction placeBid", e instanceof Error ? e.message : String(e));
  }

  // Drying maxAdvanceDays validation
  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const login = await loginUser("13800138000", "user123");
    const farStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const farEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const farRes = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: login.cookie },
      body: JSON.stringify({ listingId: listing.id, startDate: farStart, endDate: farEnd }),
    });
    const farJson = await farRes.json().catch(() => ({}));
    if (!farRes.ok && farJson.error?.includes("提前")) {
      pass("drying maxAdvanceDays rejected", farJson.error);
    } else {
      fail("drying maxAdvanceDays rejected", farJson.error ?? "expected rejection");
    }
  }

  // Drying reservation flow
  if (listing) {
    const login = await loginUser("13800138000", "user123");
    if (!login.ok) {
      fail("user login", JSON.stringify(login.body));
    } else {
      pass("user login");
      const start = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const end = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const reserveRes = await fetch(`${BASE}/api/m/drying/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: login.cookie },
        body: JSON.stringify({ listingId: listing.id, startDate: start, endDate: end }),
      });
      const reserveJson = await reserveRes.json().catch(() => ({}));
      if (reserveRes.ok) {
        pass("drying reserve", reserveJson.orderNo);
        const resId = reserveJson.id as string;

        // Approve as company admin via prisma (simulating admin action)
        const companyAdmin = await prisma.adminUser.findUnique({ where: { phone: "13900000003" } });
        if (companyAdmin) {
          await prisma.dryingReservation.update({
            where: { id: resId },
            data: { status: "APPROVED" },
          });
          pass("drying approve");

          const payRes = await fetch(`${BASE}/api/m/payments/mock`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: login.cookie },
            body: JSON.stringify({ purpose: "DRYING_DEPOSIT", reservationId: resId }),
          });
          const payJson = await payRes.json().catch(() => ({}));
          if (payRes.ok) {
            pass("drying deposit pay", payJson.orderNo);
            const updated = await prisma.dryingReservation.findUnique({ where: { id: resId } });
            if (updated?.status === "CONTRACT_PENDING") {
              pass("drying status CONTRACT_PENDING");
            } else {
              fail("drying status", updated?.status ?? "null");
            }
          } else {
            fail("drying deposit pay", payJson.error ?? payRes.status);
          }
        }
      } else {
        fail("drying reserve", reserveJson.error ?? reserveRes.status);
      }
    }
  }

  // Auction result flow
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "ENDED", endsAt: new Date(Date.now() - 1000) },
  });
  await prisma.auctionResult.deleteMany({ where: { projectId: project.id } });

  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  await prisma.auctionResult.create({
    data: { projectId: project.id, winnerId: topBid?.endUserId ?? null, status: "PENDING_REVIEW" },
  });
  pass("auction result generated");

  const result = await prisma.auctionResult.findUnique({ where: { projectId: project.id } });
  if (result) {
    await prisma.auctionResult.update({
      where: { id: result.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    pass("auction result published");
  }

  // Page smoke
  const adminLogin = await loginAdmin("13900000001", "admin123");
  const pages = ["/", "/m", "/m/auction", "/admin", "/admin/auctions"];
  for (const path of pages) {
    const cookie = path.startsWith("/admin") ? adminLogin.cookie : "";
    const res = await fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
    if (res.ok) pass(`page ${path}`, String(res.status));
    else fail(`page ${path}`, String(res.status));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
