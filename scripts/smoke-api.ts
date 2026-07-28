/**
 * Smoke test for HTTP APIs (run with dev server on :3000).
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

type Jar = Map<string, string>;

function storeSetCookies(jar: Jar, res: Response) {
  const lines =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  if (lines.length === 0) {
    const single = res.headers.get("set-cookie");
    if (single) lines.push(single);
  }
  for (const line of lines) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function req(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    jar?: Jar;
    contentType?: string;
    rawBody?: string;
  } = {},
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {};
  if (opts.jar) headers.Cookie = cookieHeader(opts.jar);
  if (opts.rawBody !== undefined) {
    headers["Content-Type"] = opts.contentType ?? "application/json";
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body:
      opts.rawBody !== undefined
        ? opts.rawBody
        : opts.body !== undefined
          ? JSON.stringify(opts.body)
          : undefined,
  });
  if (opts.jar) storeSetCookies(opts.jar, res);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const failures: string[] = [];
  const check = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`OK ${name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`FAIL ${name}: ${msg}`);
      failures.push(`${name}: ${msg}`);
    }
  };

  const userJar: Jar = new Map();
  const adminJar: Jar = new Map();

  await check("GET /", async () => {
    const { status } = await req("/");
    assert(status === 200, `status ${status}`);
  });

  await check("user login", async () => {
    const { status, json } = await req("/api/auth/login", {
      method: "POST",
      body: { phone: "13800138000", password: "user123" },
      jar: userJar,
    });
    assert(status === 200, `status ${status}`);
    assert((json as { ok?: boolean }).ok === true, JSON.stringify(json));
    assert(userJar.has("sishi_user_session"), "missing session cookie");
  });

  await check("admin login", async () => {
    const { status, json } = await req("/api/auth/admin/login", {
      method: "POST",
      body: { phone: "13900000001", password: "admin123" },
      jar: adminJar,
    });
    assert(status === 200, `status ${status}`);
    assert((json as { ok?: boolean }).ok === true, JSON.stringify(json));
    assert(adminJar.has("sishi_admin_session"), "missing admin session cookie");
  });

  await check("bid without auth returns 401", async () => {
    const { status } = await req("/api/m/auction/fake/bid", {
      method: "POST",
      body: { amount: 100 },
    });
    assert(status === 401, `status ${status}`);
  });

  await check("upload non-multipart returns 400", async () => {
    const { status } = await req("/api/upload", {
      method: "POST",
      jar: adminJar,
      rawBody: "{}",
    });
    assert(status === 400, `status ${status}`);
  });

  await check("register validation", async () => {
    const { status } = await req("/api/auth/register", {
      method: "POST",
      body: { phone: "bad", password: "x" },
    });
    assert(status === 400, `status ${status}`);
  });

  await check("dev third-party token", async () => {
    const { status, json } = await req("/api/dev/third-party-token");
    assert(status === 200, `status ${status}`);
    assert(typeof (json as { token?: string }).token === "string", JSON.stringify(json));
  });

  await check("admin create asset (JSON)", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    await prisma.$disconnect();
    assert(!!org, "no org in db");
    const { status, json } = await req("/api/admin/assets", {
      method: "POST",
      body: {
        orgId: org!.id,
        type: "LAND",
        name: `冒烟测试资产${Date.now()}`,
        locationText: "测试",
        status: "IDLE",
      },
      jar: adminJar,
    });
    assert(status === 200, `status ${status} ${JSON.stringify(json)}`);
    assert((json as { ok?: boolean }).ok === true, JSON.stringify(json));
  });

  await check("live auction bid flow", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { Decimal } = await import("@prisma/client/runtime/library");
    const prisma = new PrismaClient();
    const asset = await prisma.asset.findFirst({ where: { status: "IDLE" } });
    assert(!!asset, "no idle asset");
    const user = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
    assert(!!user, "demo user missing");
    const project = await prisma.auctionProject.create({
      data: {
        code: `SMOKE${Date.now()}`,
        assetId: asset!.id,
        startPrice: new Decimal(1000),
        bidStep: new Decimal(100),
        depositAmount: new Decimal(50),
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 86400_000),
        status: "LIVE",
      },
    });
    await prisma.auctionRegistration.create({
      data: {
        projectId: project.id,
        endUserId: user!.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });
    await prisma.$disconnect();

    const { status, json } = await req(`/api/m/auction/${project.id}/bid`, {
      method: "POST",
      body: { amount: 1000 },
      jar: userJar,
    });
    assert(status === 200, `status ${status} ${JSON.stringify(json)}`);
    assert((json as { ok?: boolean }).ok === true, JSON.stringify(json));
  });

  await check("drying duplicate reservation returns 409", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const listing = await prisma.dryingFieldListing.findFirst();
    await prisma.$disconnect();
    assert(!!listing, "no drying listing");
    const day = 10 + (Date.now() % 15);
    const body = {
      listingId: listing!.id,
      startDate: `2026-10-${String(day).padStart(2, "0")}`,
      endDate: `2026-10-${String(day + 1).padStart(2, "0")}`,
    };
    const first = await req("/api/m/drying/reserve", {
      method: "POST",
      body,
      jar: userJar,
    });
    assert(
      first.status === 200 || first.status === 400,
      `first status ${first.status} ${JSON.stringify(first.json)}`,
    );
    if (first.status !== 200) return;
    const second = await req("/api/m/drying/reserve", {
      method: "POST",
      body,
      jar: userJar,
    });
    assert(second.status === 409, `status ${second.status} ${JSON.stringify(second.json)}`);
  });

  if (failures.length) {
    console.error("\nSmoke test failed:");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }
  console.log("\nAll smoke tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
