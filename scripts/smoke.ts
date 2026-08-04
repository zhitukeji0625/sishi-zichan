/**
 * 功能冒烟测试：登录、出价、晒场预约、SSO、管理后台页面、上传校验
 * 运行前需启动 dev server (npm run dev) 并执行 db:seed
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name}: ${detail}`);
}

function parseCookies(setCookie: string | null): string {
  if (!setCookie) return "";
  return setCookie
    .split(/,(?=\s*\w+=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
}

async function fetchJson(
  path: string,
  opts: RequestInit & { cookie?: string } = {},
): Promise<{ status: number; json: unknown; setCookie: string | null }> {
  const headers = new Headers(opts.headers);
  if (opts.cookie) headers.set("Cookie", opts.cookie);
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const setCookie = res.headers.getSetCookie?.()
    ? res.headers.getSetCookie().join(",")
    : res.headers.get("set-cookie");
  const json = await res.json().catch(() => null);
  return { status: res.status, json, setCookie };
}

async function fetchPage(path: string, cookie?: string): Promise<number> {
  const headers: HeadersInit = {};
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  return res.status;
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  // --- 公开页面 ---
  for (const p of ["/", "/m", "/m/login", "/m/auction", "/m/drying", "/admin/login"]) {
    const status = await fetchPage(p);
    if (status >= 200 && status < 400) pass(`GET ${p}`, `${status}`);
    else fail(`GET ${p}`, `status ${status}`);
  }

  // --- 用户登录 ---
  let userCookie = "";
  const loginRes = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  if (loginRes.status === 200 && (loginRes.json as { ok?: boolean })?.ok) {
    userCookie = parseCookies(loginRes.setCookie);
    pass("用户登录");
  } else {
    fail("用户登录", `status ${loginRes.status} ${JSON.stringify(loginRes.json)}`);
  }

  // --- 管理员登录 ---
  let adminCookie = "";
  const adminLoginRes = await fetchJson("/api/auth/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
  });
  if (adminLoginRes.status === 200 && (adminLoginRes.json as { ok?: boolean })?.ok) {
    adminCookie = parseCookies(adminLoginRes.setCookie);
    pass("管理员登录");
  } else {
    fail("管理员登录", `status ${adminLoginRes.status}`);
  }

  // --- 第三方 SSO ---
  const tokenRes = await fetchJson("/api/dev/third-party-token?u_id=smoke_test_user");
  const token = (tokenRes.json as { token?: string })?.token;
  if (token) {
    const ssoRes = await fetchJson("/api/auth/third-party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (ssoRes.status === 200 && (ssoRes.json as { ok?: boolean })?.ok) {
      pass("第三方 SSO 登录");
    } else {
      fail("第三方 SSO 登录", `status ${ssoRes.status}`);
    }
  } else {
    fail("获取第三方 token", "no token");
  }

  // --- 出价 ---
  const auctionPage = await fetch(`${BASE}/m/auction`, {
    headers: { Cookie: userCookie },
  });
  const auctionHtml = await auctionPage.text();
  const projectMatch = auctionHtml.match(/\/m\/auction\/(c[a-z0-9]{20,})/i);
  const projectId = projectMatch?.[1];
  if (!projectId) {
    fail("获取竞拍项目 ID", "未在页面中找到");
  } else {
    let amount = 8200;
    let bidOk = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const bidRes = await fetchJson(`/api/m/auction/${projectId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cookie: userCookie,
        body: JSON.stringify({ amount }),
      });
      if (bidRes.status === 200 && (bidRes.json as { ok?: boolean })?.ok) {
        bidOk = true;
        pass("竞拍出价", `${projectId} @ ${amount}`);
        break;
      }
      const errMsg = (bidRes.json as { error?: string })?.error ?? "";
      const minMatch = errMsg.match(/不低于\s*([\d.]+)/);
      if (minMatch) amount = parseFloat(minMatch[1]);
      else break;
    }
    if (!bidOk) fail("竞拍出价", `project ${projectId}, last amount ${amount}`);
  }

  // --- 晒场预约 ---
  const dryingPage = await fetch(`${BASE}/m/drying`, {
    headers: { Cookie: userCookie },
  });
  const dryingHtml = await dryingPage.text();
  const listingMatch = dryingHtml.match(/\/m\/drying\/(c[a-z0-9]{20,})/i);
  const listingId = listingMatch?.[1];
  if (!listingId) {
    fail("获取晒场 ID", "未在页面中找到");
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const reserveRes = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cookie: userCookie,
      body: JSON.stringify({
        listingId,
        startDate: fmt(tomorrow),
        endDate: fmt(dayAfter),
      }),
    });
    if (reserveRes.status === 200 && (reserveRes.json as { ok?: boolean })?.ok) {
      pass("晒场预约", listingId);
    } else {
      fail("晒场预约", `status ${reserveRes.status} ${JSON.stringify(reserveRes.json)}`);
    }
  }

  // --- 管理后台页面 ---
  const adminPages = [
    "/admin",
    "/admin/assets",
    "/admin/auctions",
    "/admin/registrations",
    "/admin/announcements",
    "/admin/drying",
    "/admin/organizations",
    "/admin/admins",
    "/admin/dict",
    "/admin/config",
    "/admin/audit",
  ];
  for (const p of adminPages) {
    const status = await fetchPage(p, adminCookie);
    if (status >= 200 && status < 400) pass(`GET ${p}`, `${status}`);
    else fail(`GET ${p}`, `status ${status}`);
  }

  // --- 上传 multipart 校验 ---
  const noMultipart = await fetchJson("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cookie: adminCookie,
    body: "{}",
  });
  if (noMultipart.status === 400) {
    pass("上传非 multipart 返回 400");
  } else {
    fail("上传非 multipart 返回 400", `got ${noMultipart.status}`);
  }

  const noAuth = await fetchJson("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data" },
    body: new FormData(),
  });
  if (noAuth.status === 401) {
    pass("上传未登录返回 401");
  } else {
    fail("上传未登录返回 401", `got ${noAuth.status}`);
  }

  // --- 汇总 ---
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${passed}/${results.length} passed`);
  if (failed.length > 0) {
    console.error("Failures:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
