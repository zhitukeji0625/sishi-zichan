import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const BASE = "http://localhost:3000";
const prisma = new PrismaClient();

async function fetchJson(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) failures.push(msg);
}

async function main() {
  const userLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  assert(userLogin.status === 200, `user login: ${userLogin.status}`);
  const setCookie = userLogin.headers.get("set-cookie") || "";
  const cookieHeader = setCookie.split(";")[0];

  const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!user) throw new Error("demo user missing");

  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("no org");
  const asset = await prisma.asset.create({
    data: { orgId: org.id, type: "LAND", name: "集成测试资产", locationText: "测试", status: "IDLE" },
  });
  const project = await prisma.auctionProject.create({
    data: {
      code: `IT${Date.now()}`,
      assetId: asset.id,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      depositAmount: new Decimal(5),
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 86400000),
      status: "LIVE",
    },
  });
  await prisma.auctionRegistration.create({
    data: { projectId: project.id, endUserId: user.id, status: "APPROVED", depositPaid: true },
  });

  const bid = await fetchJson(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ amount: 100 }),
  });
  assert(
    bid.status === 200 && (bid.json as { ok?: boolean }).ok,
    `bid: ${bid.status} ${JSON.stringify(bid.json)}`,
  );

  const bidLow = await fetchJson(`/api/m/auction/${project.id}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ amount: 105 }),
  });
  assert(bidLow.status === 400, `bid low should fail: ${bidLow.status}`);

  const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  if (listing) {
    const start = new Date();
    start.setDate(start.getDate() + 30);
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    const reserve = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({
        listingId: listing.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
    });
    assert(
      reserve.status === 200 && (reserve.json as { ok?: boolean }).ok,
      `drying reserve: ${reserve.status} ${JSON.stringify(reserve.json)}`,
    );
  }

  const pages = ["/", "/m", "/m/auction", "/m/drying", "/admin/login"];
  for (const p of pages) {
    const res = await fetch(`${BASE}${p}`);
    assert(res.status === 200, `page ${p}: ${res.status}`);
  }

  await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionRegistration.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionProject.delete({ where: { id: project.id } });
  await prisma.asset.delete({ where: { id: asset.id } });

  await prisma.$disconnect();

  if (failures.length) {
    console.error("FAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("All integration tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
