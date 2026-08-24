#!/usr/bin/env node
/**
 * Functional smoke tests against a running dev server.
 * Usage: BASE_URL=http://localhost:3000 node scripts/functional-smoke.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

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

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

function cookieHeader(setCookie) {
  if (!setCookie) return "";
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log(`\nFunctional smoke tests → ${BASE}\n`);

  // 1. Public pages
  {
    const r = await fetch(`${BASE}/`);
    assert("GET / returns 200", r.status === 200);
    const m = await fetch(`${BASE}/m`);
    assert("GET /m returns 200", m.status === 200);
    const admin = await fetch(`${BASE}/admin/login`);
    assert("GET /admin/login returns 200", admin.status === 200);
  }

  // 2. Dev third-party token
  let ssoToken = null;
  {
    const { res, json } = await fetchJson("/api/dev/third-party-token?u_id=smoke_test");
    assert("GET /api/dev/third-party-token returns 200", res.status === 200, JSON.stringify(json));
    assert("third-party token has token field", !!json?.token);
    ssoToken = json?.token;
  }

  // 3. Admin login
  let adminCookie = "";
  {
    const { res, json } = await fetchJson("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    assert("admin login returns 200", res.status === 200, JSON.stringify(json));
    adminCookie = cookieHeader(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    assert("admin login sets cookie", adminCookie.includes("sishi_admin_session"));
  }

  // 4. Admin protected page
  {
    const r = await fetch(`${BASE}/admin`, { headers: { Cookie: adminCookie } });
    assert("GET /admin with session returns 200", r.status === 200);
  }

  // 5. User login
  let userCookie = "";
  {
    const { res, json } = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    assert("user login returns 200", res.status === 200, JSON.stringify(json));
    userCookie = cookieHeader(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    assert("user login sets cookie", userCookie.includes("sishi_user_session"));
  }

  // 6. Third-party SSO
  {
    const { res, json } = await fetchJson("/api/auth/third-party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ssoToken }),
    });
    assert("third-party auth returns 200", res.status === 200, JSON.stringify(json));
  }

  // 7. Protected API without auth
  {
    const { res } = await fetchJson("/api/m/auction/fake/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    assert("bid without auth returns 401", res.status === 401);
  }

  // 8. Upload without multipart
  {
    const { res } = await fetchJson("/api/upload", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert("upload without file returns 400", res.status === 400);
  }

  // 9. Admin asset without multipart
  {
    const { res } = await fetchJson("/api/admin/assets", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    assert("admin asset without form returns 400", res.status === 400);
  }

  // 10. Find live auction and place bid
  {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
    });
    await prisma.$disconnect();

    if (!project) {
      assert("live auction project exists", false, "no LIVE project in DB");
    } else {
      const topBid = await (async () => {
        const { PrismaClient: PC } = await import("@prisma/client");
        const p = new PC();
        const top = await p.auctionBid.findFirst({
          where: { projectId: project.id },
          orderBy: { amount: "desc" },
        });
        await p.$disconnect();
        return top;
      })();

      const minBid = topBid
        ? Number(topBid.amount) + Number(project.bidStep)
        : Number(project.startPrice);

      const { res, json } = await fetchJson(`/api/m/auction/${project.id}/bid`, {
        method: "POST",
        headers: { Cookie: userCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: minBid }),
      });
      assert("place bid returns 200", res.status === 200, JSON.stringify(json));
      assert("place bid returns bidId", !!json?.bidId);
    }
  }

  // 11. Drying reservation
  let listingId = null;
  {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
    listingId = listing?.id ?? null;
    await prisma.$disconnect();
  }

  if (listingId) {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { res, json } = await fetchJson("/api/m/drying/reserve", {
      method: "POST",
      headers: { Cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      }),
    });
    assert("drying reserve returns 200", res.status === 200, JSON.stringify(json));
    assert("drying reserve returns id", !!json?.id);
  } else {
    assert("operating drying listing exists", false);
  }

  // 12. Mobile pages with auth
  {
    const pages = ["/m/auction", "/m/drying", "/m/orders", "/m/me"];
    for (const p of pages) {
      const r = await fetch(`${BASE}${p}`, { headers: { Cookie: userCookie } });
      assert(`GET ${p} returns 200`, r.status === 200);
    }
  }

  // 13. Admin pages
  {
    const pages = ["/admin/assets", "/admin/auctions", "/admin/drying", "/admin/dict"];
    for (const p of pages) {
      const r = await fetch(`${BASE}${p}`, { headers: { Cookie: adminCookie } });
      assert(`GET ${p} returns 200`, r.status === 200);
    }
  }

  // 14. Favicon
  {
    const r = await fetch(`${BASE}/favicon.ico`);
    assert("GET /favicon.ico returns 200 or 304", r.status === 200 || r.status === 304);
  }

  // 15. Logout
  {
    const { res } = await fetchJson("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: userCookie },
    });
    assert("user logout returns 200", res.status === 200);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
