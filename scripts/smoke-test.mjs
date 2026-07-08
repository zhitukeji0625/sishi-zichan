#!/usr/bin/env node
/**
 * Smoke tests against running Next.js server (npm start).
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

function cookieJar(setCookie) {
  if (!setCookie) return "";
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(";")[0]).join("; ");
}

/** Extract entity IDs from page HTML, skipping Next.js route segment names like "page". */
function extractEntityIds(html, prefix) {
  const re = new RegExp(`${prefix}/([a-z0-9]{20,})`, "gi");
  const ids = new Set();
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  {
    const res = await fetch(`${BASE}/`);
    assert("GET / returns 200", res.status === 200, `got ${res.status}`);
  }
  {
    const res = await fetch(`${BASE}/m/login`);
    assert("GET /m/login returns 200", res.status === 200, `got ${res.status}`);
  }
  {
    const res = await fetch(`${BASE}/admin/login`);
    assert("GET /admin/login returns 200", res.status === 200, `got ${res.status}`);
  }

  {
    const { res } = await jsonFetch("/api/dev/third-party-token");
    assert("GET /api/dev/third-party-token returns 404 in prod", res.status === 404, `got ${res.status}`);
  }

  {
    const { res } = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: "x", startDate: "2026-08-01", endDate: "2026-08-02" }),
    });
    assert("POST /api/m/drying/reserve without auth returns 401", res.status === 401, `got ${res.status}`);
  }

  let userCookie = "";
  {
    const { res, body } = await jsonFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "user123" }),
    });
    userCookie = cookieJar(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    assert("User login succeeds", res.status === 200 && body?.ok === true, JSON.stringify(body));
  }

  let adminCookie = "";
  {
    const { res, body } = await jsonFetch("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13900000001", password: "admin123" }),
    });
    adminCookie = cookieJar(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    assert("Admin login succeeds", res.status === 200 && body?.ok === true, JSON.stringify(body));
  }

  {
    const { res, body } = await jsonFetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    assert(
      "POST /api/upload non-multipart returns 400",
      res.status === 400,
      `got ${res.status} ${JSON.stringify(body)}`,
    );
  }

  {
    const { res } = await jsonFetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        listingId: "invalid",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
      }),
    });
    assert("Invalid listing returns 404", res.status === 404, `got ${res.status}`);
  }

  const dryingHtml = await (await fetch(`${BASE}/m/drying`, { headers: { Cookie: userCookie } })).text();
  const listingIds = extractEntityIds(dryingHtml, "/m/drying");
  const listingId = listingIds[0] ?? null;
  assert("Drying listing found on /m/drying", !!listingId, listingIds.join(", "));

  function futureDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  let startDate = "";
  let endDate = "";
  if (listingId) {
    let reserved = false;
    for (let offset = 25; offset <= 60 && !reserved; offset += 2) {
      startDate = futureDate(offset);
      endDate = futureDate(offset + 1);
      const { res, body } = await jsonFetch("/api/m/drying/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userCookie },
        body: JSON.stringify({ listingId, startDate, endDate }),
      });
      if (res.status === 200 && body?.ok === true) {
        reserved = true;
        assert("Drying reservation succeeds", true);
      } else if (res.status !== 409) {
        assert("Drying reservation succeeds", false, JSON.stringify(body));
        break;
      }
    }
    if (!reserved) {
      assert("Drying reservation succeeds", false, "no available date in range");
    }
    {
      const { res, body } = await jsonFetch("/api/m/drying/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userCookie },
        body: JSON.stringify({ listingId, startDate, endDate }),
      });
      assert(
        "Duplicate drying reservation returns 409",
        res.status === 409,
        `got ${res.status} ${JSON.stringify(body)}`,
      );
    }
  }

  const auctionHtml = await (await fetch(`${BASE}/m/auction`, { headers: { Cookie: userCookie } })).text();
  const projectIds = extractEntityIds(auctionHtml, "/m/auction");
  const liveProjectId = projectIds[0] ?? null;

  if (liveProjectId) {
    const detailHtml = await (
      await fetch(`${BASE}/m/auction/${liveProjectId}`, { headers: { Cookie: userCookie } })
    ).text();
    const isLive = detailHtml.includes("进行中") || detailHtml.includes("status-live");
    if (isLive) {
      const minMatch = detailHtml.match(/最低\s*¥(?:<!--\s*-->)?([\d.]+)/);
      const bidAmount = minMatch ? parseFloat(minMatch[1]) : 8200;
      const { res, body } = await jsonFetch(`/api/m/auction/${liveProjectId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userCookie },
        body: JSON.stringify({ amount: bidAmount }),
      });
      assert("Auction bid on LIVE project succeeds", res.status === 200 && body?.ok === true, JSON.stringify(body));
    } else {
      console.log("⚠ No LIVE auction project — bid test skipped");
    }

    const { res, body } = await jsonFetch("/api/m/payments/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ purpose: "AUCTION_DEPOSIT", auctionProjectId: liveProjectId }),
    });
    assert(
      "Duplicate auction deposit returns 409",
      res.status === 409,
      `got ${res.status} ${JSON.stringify(body)}`,
    );
  } else {
    console.log("⚠ No auction project found — payment test skipped");
    failed++;
    console.error("✗ Auction project required for deposit duplicate test");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
