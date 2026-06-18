#!/usr/bin/env node
/**
 * Functional smoke tests against a running dev server (npm run dev).
 * Usage: BASE_URL=http://localhost:3000 node scripts/functional-smoke.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const CUID_RE = /\/[cm][a-z0-9]{20,}/i;

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function fetchText(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html or plain */
  }
  return { res, text, json };
}

function cookieJar() {
  const jar = new Map();
  return {
    store(res) {
      const set = res.headers.getSetCookie?.() ?? [];
      for (const c of set) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function loginUser(jar) {
  const { res, json } = await fetchText("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  jar.store(res);
  return { res, json };
}

async function loginAdmin(jar) {
  const { res, json } = await fetchText("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  jar.store(res);
  return { res, json };
}

async function main() {
  console.log(`Functional smoke @ ${BASE}\n`);

  // Public pages
  for (const [name, path] of [
    ["首页", "/"],
    ["H5 首页", "/m"],
    ["竞拍列表", "/m/auction"],
    ["晒场列表", "/m/drying"],
    ["管理登录", "/admin/login"],
  ]) {
    const { res, text } = await fetchText(path);
    assert(`${name} 可访问`, res.status === 200 && text.includes("<!DOCTYPE html>"));
  }

  // Auth guards
  const unauthBid = await fetchText("/api/m/auction/fake/bid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  assert("未登录出价被拒绝", unauthBid.res.status === 401);

  const unauthReserve = await fetchText("/api/m/drying/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "x", startDate: "2026-06-20", endDate: "2026-06-21" }),
  });
  assert("未登录预约被拒绝", unauthReserve.res.status === 401);

  // User login
  const userJar = cookieJar();
  const userLogin = await loginUser(userJar);
  assert("用户登录", userLogin.res.status === 200 && userLogin.json?.ok === true);

  // Auction page has project link (exclude /m/auction/page false positive)
  const auctionPage = await fetchText("/m/auction", {
    headers: userJar.header() ? { Cookie: userJar.header() } : {},
  });
  const projectMatch = auctionPage.text.match(/\/m\/auction\/(cm[a-z0-9]{20,})/i);
  const projectId = projectMatch?.[1];
  assert("竞拍列表含项目链接", !!projectId, "no CUID in /m/auction");

  if (projectId) {
    const detail = await fetchText(`/m/auction/${projectId}`, {
      headers: { Cookie: userJar.header() },
    });
    assert("竞拍详情可访问", detail.res.status === 200);

    let bidAmount = 8000;
    const bidStepMatch = detail.text.match(/加价幅度[^¥\d]*([\d.]+)/);
    const topMatch = detail.text.match(/当前最高出价[^¥\d]*([\d.]+)/);
    if (topMatch && bidStepMatch) {
      bidAmount = parseFloat(topMatch[1]) + parseFloat(bidStepMatch[1]);
    } else if (topMatch) {
      bidAmount = parseFloat(topMatch[1]) + 200;
    }

    let bid = await fetchText(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userJar.header() },
      body: JSON.stringify({ amount: bidAmount }),
    });
    if (!bid.json?.ok && bid.json?.error?.includes("不低于")) {
      const minMatch = bid.json.error.match(/([\d.]+)/);
      if (minMatch) {
        bidAmount = parseFloat(minMatch[1]);
        bid = await fetchText(`/api/m/auction/${projectId}/bid`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: userJar.header() },
          body: JSON.stringify({ amount: bidAmount }),
        });
      }
    }
    assert(
      "竞拍出价成功",
      bid.res.status === 200 && bid.json?.ok === true && !!bid.json?.bidId,
      bid.json?.error || bid.text.slice(0, 120),
    );
  }

  // Drying reserve
  const dryingPage = await fetchText("/m/drying", {
    headers: { Cookie: userJar.header() },
  });
  const listingMatch = dryingPage.text.match(/\/m\/drying\/(cm[a-z0-9]{20,})/i);
  const listingId = listingMatch?.[1];
  assert("晒场列表含上架链接", !!listingId);

  if (listingId) {
    const reserve = await fetchText("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userJar.header() },
      body: JSON.stringify({
        listingId,
        startDate: "2026-07-01",
        endDate: "2026-07-03",
      }),
    });
    assert(
      "晒场预约提交",
      reserve.res.status === 200 && reserve.json?.ok === true,
      reserve.json?.error || reserve.text.slice(0, 120),
    );
  }

  // Admin login + protected pages
  const adminJar = cookieJar();
  const adminLogin = await loginAdmin(adminJar);
  assert(
    "管理员登录",
    adminLogin.res.status === 200 && adminLogin.json?.ok === true,
    adminLogin.json?.error,
  );

  for (const [name, path] of [
    ["管理首页", "/admin"],
    ["资产管理", "/admin/assets"],
    ["竞拍管理", "/admin/auctions"],
    ["晒场管理", "/admin/drying"],
    ["字典管理", "/admin/dict"],
    ["组织管理", "/admin/organizations"],
  ]) {
    const { res, text } = await fetchText(path, {
      headers: { Cookie: adminJar.header() },
      redirect: "manual",
    });
    const ok = res.status === 200 && text.includes("<!DOCTYPE html>");
    assert(`${name} 可访问`, ok, `status ${res.status}`);
  }

  // Third-party token (dev only)
  const tp = await fetchText("/api/dev/third-party-token?u_id=smoke-test-user");
  assert(
    "第三方 token 接口",
    tp.res.status === 200 && typeof tp.json?.token === "string",
    tp.json?.error,
  );

  // SSO page loads (do not follow redirect to avoid overwriting demo user session)
  if (tp.json?.token) {
    const sso = await fetchText(`/m/sso?token=${encodeURIComponent(tp.json.token)}`, {
      redirect: "manual",
    });
    assert("SSO 页面响应", sso.res.status >= 200 && sso.res.status < 400);
  }

  // Mock payment validation
  if (projectId) {
    const badPay = await fetchText("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userJar.header() },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT" }),
    });
    assert("模拟支付缺参校验", badPay.res.status === 400);
  }

  // User logout
  const logout = await fetchText("/api/auth/logout", {
    method: "POST",
    headers: { Cookie: userJar.header() },
  });
  assert("用户登出", logout.res.status === 200);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
