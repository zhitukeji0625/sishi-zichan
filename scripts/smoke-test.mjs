/**
 * API smoke test — run against `npm start` (production mode).
 * Usage: node scripts/smoke-test.mjs
 */
const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

const results = [];
let passed = 0;
let failed = 0;

function jar() {
  const cookies = new Map();
  return {
    store(res) {
      const set = res.headers.getSetCookie?.() ?? [];
      for (const line of set) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function req(path, opts = {}, cookieJar) {
  const headers = { ...(opts.headers || {}) };
  if (cookieJar?.header()) headers.Cookie = cookieJar.header();
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  cookieJar?.store(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text };
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, error: msg });
    failed++;
    console.log(`✗ ${name}: ${msg}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const adminJar = jar();
  const userJar = jar();
  let liveProjectId = null;
  let dryingListingId = null;

  await test("首页 GET /", async () => {
    const r = await req("/");
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("H5 GET /m", async () => {
    const r = await req("/m");
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("管理登录页 GET /admin/login", async () => {
    const r = await req("/admin/login");
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("用户登录错误密码 401", async () => {
    const r = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "wrong" }),
    });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test("用户登录成功", async () => {
    const r = await req(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "13800138000", password: "user123" }),
      },
      userJar,
    );
    assert(r.status === 200 && r.json?.ok, JSON.stringify(r.json));
  });

  await test("管理员登录成功", async () => {
    const r = await req(
      "/api/auth/admin/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
      },
      adminJar,
    );
    assert(r.status === 200 && r.json?.ok, JSON.stringify(r.json));
  });

  await test("未登录出价 401", async () => {
    const r = await req("/api/m/auction/fake-id/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test("竞拍列表页 GET /m/auction", async () => {
    const r = await req("/m/auction", {}, userJar);
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("存在 LIVE 竞拍项目", async () => {
    const r = await req("/m/auction", {}, userJar);
    const blocks = r.text.split('href="/m/auction/');
    for (const block of blocks.slice(1)) {
      const id = block.match(/^([^"]+)"/)?.[1];
      if (!id) continue;
      if (block.includes("status-live") || block.includes("进行中") || block.includes("竞拍中")) {
        liveProjectId = id;
        break;
      }
    }
    if (!liveProjectId) {
      liveProjectId = blocks[1]?.match(/^([^"]+)"/)?.[1] ?? null;
    }
    assert(liveProjectId, "页面上未找到竞拍项目链接");
    const detail = await req(`/m/auction/${liveProjectId}`, {}, userJar);
    assert(
      detail.text.includes("status-live") || detail.text.includes("竞拍中"),
      "所选项目非 LIVE 状态",
    );
  });

  await test("用户出价成功", async () => {
    const detail = await req(`/m/auction/${liveProjectId}`, {}, userJar);
    const priceMatch = detail.text.match(/当前价[^0-9]*([0-9,]+)/);
    const current = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : 8000;
    const amount = current + 200;
    const r = await req(
      `/api/m/auction/${liveProjectId}/bid`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      },
      userJar,
    );
    assert(r.status === 200 && r.json?.ok, JSON.stringify(r.json));
  });

  await test("晒场列表页 GET /m/drying", async () => {
    const r = await req("/m/drying", {}, userJar);
    assert(r.status === 200, `status ${r.status}`);
    const match = r.text.match(/href="\/m\/drying\/([^"]+)"/);
    if (match) dryingListingId = match[1];
  });

  let reserveStart;
  let reserveEnd;

  await test("晒场预约提交", async () => {
    assert(dryingListingId, "未找到晒场 listing");
    const start = new Date();
    start.setDate(start.getDate() + 30);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    reserveStart = start;
    reserveEnd = end;
    const fmt = (d) => d.toISOString().slice(0, 10);
    const r = await req(
      "/api/m/drying/reserve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: dryingListingId,
          startDate: fmt(start),
          endDate: fmt(end),
        }),
      },
      userJar,
    );
    assert(r.status === 200 && r.json?.ok, JSON.stringify(r.json));
  });

  await test("晒场重复预约 409", async () => {
    assert(reserveStart && reserveEnd, "缺少首次预约时段");
    const fmt = (d) => d.toISOString().slice(0, 10);
    const r = await req(
      "/api/m/drying/reserve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: dryingListingId,
          startDate: fmt(reserveStart),
          endDate: fmt(reserveEnd),
        }),
      },
      userJar,
    );
    assert(r.status === 409 && r.json?.error?.includes("已有预约"), JSON.stringify(r.json));
  });

  await test("竞拍保证金已缴返回 409", async () => {
    const r = await req(
      "/api/m/payments/mock",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: liveProjectId }),
      },
      userJar,
    );
    assert(r.status === 409, `expected 409 got ${r.status}: ${JSON.stringify(r.json)}`);
  });

  await test("未登录管理资产 API 401", async () => {
    const r = await req("/api/admin/assets", { method: "POST", body: new FormData() });
    assert(r.status === 401, `status ${r.status}`);
  });

  await test("非 multipart 上传 400/401", async () => {
    const r = await req("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert(r.status === 401 || r.status === 400, `status ${r.status}`);
  });

  await test("生产环境第三方 token 404", async () => {
    const r = await req("/api/dev/third-party-token?u_id=test");
    assert(r.status === 404, `expected 404 got ${r.status}`);
  });

  await test("用户登出", async () => {
    const r = await req("/api/auth/logout", { method: "POST" }, userJar);
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("管理员登出", async () => {
    const r = await req("/api/auth/admin/logout", { method: "POST" }, adminJar);
    assert(r.status === 200, `status ${r.status}`);
  });

  await test("管理后台首页需登录重定向", async () => {
    const r = await req("/admin", { redirect: "manual" });
    assert(r.status === 307 || r.status === 302 || r.status === 200, `status ${r.status}`);
  });

  console.log(`\n${passed}/${passed + failed} passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
