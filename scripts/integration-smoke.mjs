#!/usr/bin/env node
/**
 * 集成冒烟：登录 Cookie、出价、烘干预约、管理端页面。
 * 需 `npm run start` + 已 seed 的 MariaDB。
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

function parseSetCookie(header) {
  if (!header) return "";
  const parts = header.split(/,(?=\s*[^;]+=)/);
  return parts.map((p) => p.split(";")[0].trim()).join("; ");
}

async function login(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const cookie = parseSetCookie(res.headers.get("set-cookie"));
  return { status: res.status, json, cookie };
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") };
}

async function post(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const failures = [];
  async function check(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      failures.push(`${name}: ${e.message}`);
      console.error(`✗ ${name}: ${e.message}`);
    }
  }

  let userCookie = "";
  let adminCookie = "";

  await check("tenant login + cookie", async () => {
    const r = await login("/api/auth/login", {
      phone: "13800138000",
      password: "user123",
    });
    assert(r.json?.ok === true, JSON.stringify(r.json));
    assert(r.cookie.includes("sishi_user_session"), "missing session cookie");
    userCookie = r.cookie;
  });

  await check("admin login + cookie", async () => {
    const r = await login("/api/auth/admin/login", {
      phone: "13900000001",
      password: "admin123",
    });
    assert(r.json?.ok === true, JSON.stringify(r.json));
    assert(r.cookie.includes("sishi_admin_session"), "missing admin cookie");
    adminCookie = r.cookie;
  });

  await check("GET /m/auction (auth)", async () => {
    const r = await get("/m/auction", userCookie);
    assert(r.status === 200, `status ${r.status}`);
  });

  await check("GET /admin (auth)", async () => {
    const r = await get("/admin", adminCookie);
    assert(r.status === 200, `status ${r.status}`);
  });

  let projectId;
  let startPrice;

  await check("find LIVE auction for demo user", async () => {
    const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
    assert(user, "demo user missing");
    const reg = await prisma.auctionRegistration.findFirst({
      where: {
        endUserId: user.id,
        status: "APPROVED",
        depositPaid: true,
        project: { status: "LIVE", endsAt: { gt: new Date() } },
      },
      include: { project: true },
      orderBy: { project: { createdAt: "desc" } },
    });
    assert(reg, "no LIVE registered project");
    projectId = reg.projectId;
    startPrice = Number(reg.project.startPrice);
  });

  await check("POST bid at start price", async () => {
    const top = await prisma.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    const min = top ? Number(top.amount) + Number((await prisma.auctionProject.findUnique({ where: { id: projectId } })).bidStep) : startPrice;
    const r = await post(`/api/m/auction/${projectId}/bid`, { amount: min }, userCookie);
    assert(r.json?.ok === true, r.text);
  });

  await check("POST bid below min (reject)", async () => {
    const r = await post(`/api/m/auction/${projectId}/bid`, { amount: 1 }, userCookie);
    assert(r.status === 400 && r.json?.error, r.text);
  });

  await check("GET /m/drying (auth)", async () => {
    const r = await get("/m/drying", userCookie);
    assert(r.status === 200, `status ${r.status}`);
  });

  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    include: { asset: true },
  });

  if (listing) {
    await check("POST drying reserve", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      const day = tomorrow.toISOString().slice(0, 10);
      const r = await post(
        "/api/m/drying/reserve",
        { listingId: listing.id, visitDate: day, peopleCount: 2 },
        userCookie,
      );
      assert(r.status === 200 || r.status === 400, r.text);
      if (r.status === 400) {
        assert(r.json?.error, r.text);
      } else {
        assert(r.json?.ok === true, r.text);
      }
    });
  } else {
    console.log("⊘ skipping drying reserve (no OPERATING listing)");
  }

  await check("register validation", async () => {
    const r = await post("/api/auth/register", { phone: "", password: "" });
    assert(r.status === 400, r.text);
  });

  await prisma.$disconnect();

  if (failures.length) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nIntegration smoke passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
