import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const p = new PrismaClient();

async function loginUser() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  const cookie = res.headers.getSetCookie?.()?.[0]?.split(";")[0] ?? "";
  const data = await res.json();
  if (!data.ok) throw new Error("user login failed");
  return cookie;
}

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  const cookie = res.headers.getSetCookie?.()?.[0]?.split(";")[0] ?? "";
  const data = await res.json();
  if (!data.ok) throw new Error("admin login failed");
  return cookie;
}

async function main() {
  const errors = [];

  const auction = await p.auctionProject.findFirst();
  const drying = await p.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  const org = await p.organization.findFirst({ where: { code: "REG61" } });

  if (!auction || !drying || !org) {
    throw new Error("Missing seed data");
  }

  const now = new Date();
  await p.auctionProject.update({
    where: { id: auction.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 3600000),
      endsAt: new Date(now.getTime() + 7 * 86400000),
    },
  });

  const userCookie = await loginUser();
  const adminCookie = await loginAdmin();

  const tests = [
    {
      name: "bid on LIVE auction",
      run: async () => {
        const project = await p.auctionProject.findUnique({
          where: { id: auction.id },
          include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
        });
        const top = project?.bids[0]?.amount ?? project?.startPrice;
        const step = project?.bidStep ?? 0;
        const minBid = Number(top) + Number(step);
        const res = await fetch(`${BASE}/api/m/auction/${auction.id}/bid`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: JSON.stringify({ amount: minBid }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(JSON.stringify(data));
      },
    },
    {
      name: "drying reserve",
      run: async () => {
        const res = await fetch(`${BASE}/api/m/drying/reserve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: JSON.stringify({
            listingId: drying.id,
            startDate: "2026-06-10",
            endDate: "2026-06-12",
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(JSON.stringify(data));
        return data.id;
      },
    },
    {
      name: "mock payment deposit",
      run: async () => {
        const res = await fetch(`${BASE}/api/m/payments/mock`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: JSON.stringify({
            purpose: "AUCTION_DEPOSIT",
            auctionProjectId: auction.id,
          }),
        });
        const data = await res.json();
        // 409 deposit already paid is acceptable
        if (!data.ok && data.error !== "保证金已缴纳") {
          throw new Error(JSON.stringify(data));
        }
      },
    },
    {
      name: "admin create asset",
      run: async () => {
        const fd = new FormData();
        fd.set("orgId", org.id);
        fd.set("type", "LAND");
        fd.set("name", "自动化测试地块");
        fd.set("locationText", "测试位置");
        fd.set("specs", "1亩");
        fd.set("description", "测试");
        fd.set("refPriceMin", "1000");
        fd.set("refPriceMax", "2000");
        fd.set("status", "IDLE");
        const res = await fetch(`${BASE}/api/admin/assets`, {
          method: "POST",
          headers: { Cookie: adminCookie },
          body: fd,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(JSON.stringify(data));
      },
    },
    {
      name: "third-party login",
      run: async () => {
        const tp = await fetch(`${BASE}/api/dev/third-party-token?u_id=ext_user_99`).then((r) => r.json());
        const res = await fetch(`${BASE}/api/auth/third-party`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tp.token }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(JSON.stringify(data));
      },
    },
  ];

  for (const t of tests) {
    try {
      await t.run();
      console.log(`PASS: ${t.name}`);
    } catch (e) {
      console.log(`FAIL: ${t.name} -> ${e.message}`);
      errors.push(t.name);
    }
  }

  const pages = [
    "/",
    "/admin",
    "/admin/assets",
    "/admin/auctions",
    "/admin/drying",
    "/admin/registrations",
    "/admin/organizations",
    "/m",
    "/m/auction",
    "/m/drying",
    `/m/auction/${auction.id}`,
    `/m/drying/${drying.id}`,
  ];

  for (const path of pages) {
    const headers = path.startsWith("/admin") ? { Cookie: adminCookie } : {};
    const res = await fetch(`${BASE}${path}`, { headers, redirect: "follow" });
    if (res.status !== 200) {
      console.log(`FAIL page ${path} -> ${res.status}`);
      errors.push(`page:${path}`);
    } else {
      console.log(`PASS page ${path}`);
    }
  }

  if (errors.length) {
    console.log("\nFailed:", errors.join(", "));
    process.exit(1);
  }
  console.log("\nAll functional tests passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
