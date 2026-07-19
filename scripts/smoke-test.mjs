#!/usr/bin/env node
/**
 * 冒烟测试：验证主要页面与 API 可用。
 * 用法：BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`OK: ${name}`);
}

function fail(name, detail) {
  failed++;
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { res, json, text };
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function parseSetCookie(res) {
  const jar = {};
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

async function main() {
  const pages = [
    "/",
    "/m",
    "/m/login",
    "/m/register",
    "/m/auction",
    "/m/drying",
    "/m/me",
    "/m/orders",
    "/admin/login",
  ];

  for (const path of pages) {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 200) ok(`GET ${path}`);
    else fail(`GET ${path}`, `HTTP ${res.status}`);
  }

  const userJar = {};
  {
    const { res, json } = await fetchJson(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    Object.assign(userJar, parseSetCookie(res));
    if (res.ok && json?.ok) ok("用户登录");
    else fail("用户登录", json?.error ?? `HTTP ${res.status}`);
  }

  const adminJar = {};
  {
    const { res, json } = await fetchJson(`${BASE}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    Object.assign(adminJar, parseSetCookie(res));
    if (res.ok && json?.ok) ok("管理员登录");
    else fail("管理员登录", json?.error ?? `HTTP ${res.status}`);
  }

  {
    const { res, json } = await fetchJson(`${BASE}/api/dev/third-party-token?u_id=smoke-test`);
    if (res.ok && json?.token) ok("第三方 Token");
    else fail("第三方 Token", `HTTP ${res.status}`);
  }

  {
    const { res } = await fetchJson(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    if (res.status === 401) ok("错误密码返回 401");
    else fail("错误密码返回 401", `HTTP ${res.status}`);
  }

  {
    const phone = `199${String(Date.now()).slice(-8)}`;
    const { res, json } = await fetchJson(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password: "test1234", name: "冒烟测试" }),
    });
    if (res.ok && json?.ok) ok("用户注册");
    else fail("用户注册", json?.error ?? `HTTP ${res.status}`);
  }

  const prisma = new PrismaClient();
  let projectId = "";
  let listingId = "";
  try {
    const live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
    projectId = live?.id ?? "";
    const listing = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
    listingId = listing?.id ?? "";
  } finally {
    await prisma.$disconnect();
  }

  if (projectId) {
    const minBid = await (async () => {
      const p = new PrismaClient();
      try {
        const project = await p.auctionProject.findUnique({ where: { id: projectId } });
        const top = await p.auctionBid.findFirst({
          where: { projectId },
          orderBy: { amount: "desc" },
        });
        if (!project) return 0;
        if (top) return Number(top.amount.toString()) + Number(project.bidStep.toString());
        return Number(project.startPrice.toString());
      } finally {
        await p.$disconnect();
      }
    })();
    const { res, json } = await fetchJson(`${BASE}/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userJar),
      },
      body: JSON.stringify({ amount: minBid }),
    });
    if (res.ok && json?.ok) ok("竞拍出价");
    else fail("竞拍出价", json?.error ?? `HTTP ${res.status}`);
  } else {
    fail("竞拍出价", "无 LIVE 竞拍项目");
  }

  if (listingId) {
    const start = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const { res, json } = await fetchJson(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(userJar),
      },
      body: JSON.stringify({ listingId, startDate: start, endDate: end }),
    });
    if (res.ok && json?.ok) ok("晒场预约");
    else fail("晒场预约", json?.error ?? `HTTP ${res.status}`);
  } else {
    fail("晒场预约", "无运营中晒场");
  }

  {
    const { res, json } = await fetchJson(`${BASE}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(adminJar),
      },
      body: "{}",
    });
    if (res.status === 400) ok("上传非 multipart 返回 400");
    else fail("上传非 multipart 返回 400", `HTTP ${res.status} ${JSON.stringify(json)}`);
  }

  {
    const res = await fetch(`${BASE}/api/m/drying/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.status === 401) ok("未登录 API 返回 401");
    else fail("未登录 API 返回 401", `HTTP ${res.status}`);
  }

  {
    const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
    if (res.status === 307 || res.status === 302) ok("未登录访问 /admin 重定向");
    else fail("未登录访问 /admin 重定向", `HTTP ${res.status}`);
  }

  {
    const res = await fetch(`${BASE}/admin`, {
      headers: { Cookie: cookieHeader(adminJar) },
      redirect: "manual",
    });
    if (res.status === 200) ok("管理员访问 /admin");
    else fail("管理员访问 /admin", `HTTP ${res.status}`);
  }

  const dictCount = await (async () => {
    const p = new PrismaClient();
    try {
      return await p.dictCategory.count();
    } finally {
      await p.$disconnect();
    }
  })();
  if (dictCount >= 14) ok(`数据字典已种子化 (${dictCount} 类)`);
  else fail("数据字典已种子化", `仅 ${dictCount} 类`);

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
