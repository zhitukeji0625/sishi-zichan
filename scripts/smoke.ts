/**
 * HTTP 冒烟测试：需已运行 `npm run dev`，并已 `npm run db:seed`。
 * 环境变量 SMOKE_BASE_URL 默认 http://localhost:3000
 */
import { config as loadEnv } from "dotenv";
import { addDays, format, startOfDay } from "date-fns";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { refreshDemoAuction } from "../prisma/refresh-demo-auction";
import { validateReservationRange } from "../src/lib/drying";
import { placeBid } from "../src/lib/auction";

loadEnv();

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, detail: string) {
  failed += 1;
  console.error(`  ✗ ${name}: ${detail}`);
}

function assert(name: string, cond: boolean, detail = "assertion failed") {
  if (cond) ok(name);
  else fail(name, detail);
}

type CookieJar = { endUser: string; admin: string };

const jar: CookieJar = { endUser: "", admin: "" };

function mergeSetCookie(existing: string, setCookie: string | null): string {
  if (!setCookie) return existing;
  const parts = setCookie.split(/,(?=\s*[^;]+=)/);
  const map = new Map<string, string>();
  for (const chunk of (existing ? existing.split("; ") : [])) {
    const eq = chunk.indexOf("=");
    if (eq > 0) map.set(chunk.slice(0, eq), chunk);
  }
  for (const raw of parts) {
    const pair = raw.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq > 0) map.set(pair.slice(0, eq), pair);
  }
  return [...map.values()].join("; ");
}

async function fetchJson(
  path: string,
  init: RequestInit & { cookie?: "end_user" | "admin" } = {},
): Promise<{ status: number; json: unknown; setCookie: string | null }> {
  const headers = new Headers(init.headers);
  const cookie =
    init.cookie === "admin" ? jar.admin : init.cookie === "end_user" ? jar.endUser : "";
  if (cookie) headers.set("cookie", cookie);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const setCookie = res.headers.get("set-cookie");
  if (init.cookie === "admin" && setCookie) jar.admin = mergeSetCookie(jar.admin, setCookie);
  if (init.cookie === "end_user" && setCookie) jar.endUser = mergeSetCookie(jar.endUser, setCookie);
  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json, setCookie };
}

async function findAvailableDryingRange(listingId: string, horizonDays = 60) {
  const today = startOfDay(new Date());
  for (let offset = 0; offset < horizonDays; offset++) {
    const start = addDays(today, offset);
    const end = start;
    const check = await validateReservationRange(listingId, start, end);
    if (check.ok) {
      return {
        startDate: format(start, "yyyy-MM-dd"),
        endDate: format(end, "yyyy-MM-dd"),
      };
    }
  }
  return null;
}

async function main() {
  console.log(`Smoke against ${BASE}\n`);

  await refreshDemoAuction(prisma);

  const live = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { registrations: { where: { endUser: { phone: "13800138000" } } } },
  });
  assert("demo LIVE auction exists", !!live, "run db:seed first");
  const drying = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
  assert("OPERATING drying listing exists", !!drying);

  for (const path of ["/", "/m", "/m/auction", "/m/drying", "/admin/login"]) {
    let res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    if (path === "/" && res.status === 500) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    }
    assert(`GET ${path} → ${res.status === 200 || res.status === 307 ? "ok" : res.status}`, res.status === 200 || res.status === 307);
  }

  const adminLogin = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    cookie: "admin",
  });
  assert("admin login", adminLogin.status === 200 && (adminLogin.json as { ok?: boolean })?.ok === true);

  const userLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    cookie: "end_user",
  });
  assert("end user login", userLogin.status === 200 && (userLogin.json as { ok?: boolean })?.ok === true);

  const badLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
  });
  assert("login rejects bad password", badLogin.status === 401);

  if (live) {
    const demoReg = live.registrations[0];
    const userId = demoReg?.endUserId;
    if (userId) {
      const top = await prisma.auctionBid.findFirst({
        where: { projectId: live.id },
        orderBy: { amount: "desc" },
      });
      const minNext = top
        ? new Decimal(top.amount.toString()).plus(live.bidStep.toString())
        : new Decimal(live.startPrice.toString());

      const bid1 = await fetchJson(`/api/m/auction/${live.id}/bid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: Number(minNext.toString()) }),
        cookie: "end_user",
      });
      assert("auction bid at min price", bid1.status === 200 && (bid1.json as { ok?: boolean })?.ok === true);

      const bidLow = await fetchJson(`/api/m/auction/${live.id}/bid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: Number(minNext.toString()) + 1 }),
        cookie: "end_user",
      });
      assert("auction rejects below increment", bidLow.status === 400);

      const afterFirst = await prisma.auctionBid.findFirst({
        where: { projectId: live.id },
        orderBy: { amount: "desc" },
      });
      const secondMin = afterFirst
        ? new Decimal(afterFirst.amount.toString()).plus(live.bidStep.toString())
        : minNext;
      const bid2 = await fetchJson(`/api/m/auction/${live.id}/bid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: Number(secondMin.toString()) }),
        cookie: "end_user",
      });
      assert("auction bid with valid increment", bid2.status === 200);

      await prisma.auctionRegistration.updateMany({
        where: { projectId: live.id, endUserId: userId },
        data: { depositPaid: true },
      });
      const payDup = await fetchJson("/api/m/payments/mock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: live.id }),
        cookie: "end_user",
      });
      assert("mock payment duplicate deposit → 409", payDup.status === 409);
    }

    const libBid = await placeBid({
      projectId: live.id,
      endUserId: (await prisma.endUser.findUniqueOrThrow({ where: { phone: "13800138000" } })).id,
      amount: new Decimal(
        (
          await prisma.auctionBid.findFirst({
            where: { projectId: live.id },
            orderBy: { amount: "desc" },
          })
        )?.amount.toString() ?? live.startPrice.toString(),
      ).plus(live.bidStep.toString()),
    });
    assert("placeBid library accepts increment", !!libBid.id);
  }

  if (drying) {
    const range = await findAvailableDryingRange(drying.id, 60);
    assert("drying slot within 60 days", !!range, "no free capacity in horizon");
    if (range) {
      const reserve = await fetchJson("/api/m/drying/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: drying.id,
          startDate: range.startDate,
          endDate: range.endDate,
        }),
        cookie: "end_user",
      });
      assert("drying reserve", reserve.status === 200 && (reserve.json as { ok?: boolean })?.ok === true);

      const badRange = await fetchJson("/api/m/drying/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: drying.id,
          startDate: "2026-12-10",
          endDate: "2026-12-01",
        }),
        cookie: "end_user",
      });
      assert("drying rejects end before start", badRange.status === 400);
    }
  }

  const tokenRes = await fetchJson("/api/dev/third-party-token?u_id=smoke-ext-1");
  assert("dev third-party token", tokenRes.status === 200);
  const token = (tokenRes.json as { token?: string })?.token;
  if (token) {
    const sso = await fetchJson("/api/auth/third-party", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert("third-party SSO login", sso.status === 200 && (sso.json as { ok?: boolean })?.ok === true);
  } else {
    fail("third-party SSO login", "no token from dev endpoint");
  }

  const adminPage = await fetch(`${BASE}/admin/assets`, {
    headers: { cookie: jar.admin },
    redirect: "manual",
  });
  assert("admin assets page with session", adminPage.status === 200);

  const uploadNoAuth = await fetchJson("/api/upload", { method: "POST", body: new FormData() });
  assert("upload requires admin", uploadNoAuth.status === 401);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
