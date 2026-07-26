/**
 * 本地冒烟：需 MariaDB + db:seed，且 dev server 在 SMOKE_BASE_URL（默认 http://localhost:3000）
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

type Check = { name: string; run: () => Promise<void> };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

function cookieFromSetCookie(setCookie: string | null, name: string): string {
  if (!setCookie) return "";
  const m = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return m?.[1] ?? "";
}

const checks: Check[] = [];

checks.push({
  name: "GET /",
  run: async () => {
    const { res } = await fetchJson("/");
    assert(res.ok, `status ${res.status}`);
  },
});

checks.push({
  name: "用户登录",
  run: async () => {
    const { res, body } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    assert(res.ok, `status ${res.status} ${JSON.stringify(body)}`);
    (globalThis as { __userCookie?: string }).__userCookie = cookieFromSetCookie(
      res.headers.get("set-cookie"),
      "sishi_user_session",
    );
  },
});

checks.push({
  name: "GET /m/me（已登录）",
  run: async () => {
    const cookie = (globalThis as { __userCookie?: string }).__userCookie ?? "";
    const { res } = await fetchJson("/m/me", {
      headers: { Cookie: `sishi_user_session=${cookie}` },
    });
    assert(res.ok, `status ${res.status}`);
  },
});

checks.push({
  name: "竞拍详情支持项目编号",
  run: async () => {
    const { res, body } = await fetchJson("/m/auction/AP1775127978692");
    assert(res.ok, `status ${res.status}`);
    assert(
      typeof body === "string" && body.includes("起拍价"),
      "竞拍详情未渲染",
    );
  },
});

checks.push({
  name: "管理员登录",
  run: async () => {
    const { res, body } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    assert(res.ok && (body as { ok?: boolean }).ok, JSON.stringify(body));
  },
});

checks.push({
  name: "晒场预约参数校验",
  run: async () => {
    const cookie = (globalThis as { __userCookie?: string }).__userCookie ?? "";
    const { res, body } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sishi_user_session=${cookie}`,
      },
      body: "{}",
    });
    assert(res.status === 400, `expected 400 got ${res.status}`);
    assert((body as { error?: string }).error, "missing error");
  },
});

async function main() {
  let failed = 0;
  for (const c of checks) {
    try {
      await c.run();
      console.log(`✓ ${c.name}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${c.name}:`, e instanceof Error ? e.message : e);
    }
  }
  if (failed > 0) {
    process.exitCode = 1;
    console.error(`\n${failed} failed`);
  } else {
    console.log(`\n${checks.length} passed`);
  }
}

main();
