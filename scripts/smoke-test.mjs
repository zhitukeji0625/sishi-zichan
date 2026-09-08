#!/usr/bin/env node
/**
 * HTTP smoke tests for sishi-zichan (25 cases).
 * Run with dev server: npm run dev
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_JAR = "/tmp/sishi_admin.cookies";
const USER_JAR = "/tmp/sishi_user.cookies";

let passed = 0;
let failed = 0;
const failures = [];

async function getIds() {
  const p = new PrismaClient();
  try {
    const [auction, listing, org] = await Promise.all([
      p.auctionProject.findFirst({ where: { status: "LIVE" }, select: { id: true } }),
      p.dryingFieldListing.findFirst({ where: { status: "OPERATING" }, select: { id: true } }),
      p.organization.findFirst({ where: { code: "REG61" }, select: { id: true } }),
    ]);
    let nextBidAmount = 8000;
    if (auction?.id) {
      const project = await p.auctionProject.findUnique({
        where: { id: auction.id },
        include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
      });
      const high = project?.bids[0]?.amount
        ? Number(project.bids[0].amount)
        : Number(project?.startPrice ?? 8000);
      const step = Number(project?.bidStep ?? 200);
      nextBidAmount = project?.bids.length ? high + step : high;
    }
    return {
      auctionId: auction?.id ?? "",
      listingId: listing?.id ?? "",
      orgId: org?.id ?? "",
      nextBidAmount,
    };
  } finally {
    await p.$disconnect();
  }
}

function curl(args) {
  try {
    return execSync(`curl -s ${args}`, { encoding: "utf8" });
  } catch (e) {
    return e.stdout?.toString() || "";
  }
}

function curlStatus(args) {
  return execSync(`curl -s -o /dev/null -w "%{http_code}" ${args}`, { encoding: "utf8" }).trim();
}

function curlRedirect(args) {
  return execSync(`curl -s -o /dev/null -w "%{redirect_url}" ${args}`, { encoding: "utf8" }).trim();
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Clean cookie jars
curl(`-c "${ADMIN_JAR}" -b "${ADMIN_JAR}" "${BASE}/"`);
curl(`-c "${USER_JAR}" -b "${USER_JAR}" "${BASE}/"`);

console.log(`\nSmoke tests against ${BASE}\n`);

const ids = await getIds();
const { auctionId, listingId, orgId, nextBidAmount } = ids;

// TC-01
test("TC-01 Portal homepage loads", () => {
  assert(curlStatus(`"${BASE}/"`) === "200", "expected 200");
  assert(curl(`"${BASE}/"`).includes("四师资产租赁"), "missing site name");
});

// TC-02
test("TC-02 Mobile home loads", () => {
  assert(curlStatus(`"${BASE}/m"`) === "200", "expected 200");
  assert(curl(`"${BASE}/m"`).includes("资产竞拍"), "missing auction section");
});

// TC-03
test("TC-03 Admin login page loads", () => {
  assert(curlStatus(`"${BASE}/admin/login"`) === "200", "expected 200");
});

// TC-04
test("TC-04 Admin area redirects when unauthenticated", () => {
  const url = curlRedirect(`"${BASE}/admin"`);
  assert(url.includes("/admin/login"), `expected redirect to login, got ${url}`);
});

// TC-05
test("TC-05 User login rejects bad credentials", () => {
  const out = execSync(
    `curl -s -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:401"), `expected 401, got ${out}`);
});

// TC-06
test("TC-06 User login success", () => {
  const out = execSync(
    `curl -s -c "${USER_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200") && out.includes('"ok":true'), `unexpected: ${out}`);
});

// TC-07
test("TC-07 User register duplicate phone returns 409", () => {
  const out = execSync(
    `curl -s -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/auth/register" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user12345"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:409"), `expected 409, got ${out}`);
});

// TC-08
test("TC-08 User register new account", () => {
  const phone = `199${Date.now().toString().slice(-8)}`;
  const out = execSync(
    `curl -s -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/auth/register" -H "Content-Type: application/json" -d '{"phone":"${phone}","password":"test1234","name":"Smoke User"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200") && out.includes('"ok":true'), `unexpected: ${out}`);
});

// TC-09
test("TC-09 User logout", () => {
  const out = execSync(
    `curl -s -b "${USER_JAR}" -c "${USER_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/auth/logout"`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200"), `expected 200, got ${out}`);
  execSync(
    `curl -s -c "${USER_JAR}" -X POST "${BASE}/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}'`,
  );
});

// TC-10
test("TC-10 Admin login success", () => {
  const out = execSync(
    `curl -s -c "${ADMIN_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200") && out.includes('"ok":true'), `unexpected: ${out}`);
});

// TC-11
test("TC-11 Admin dashboard accessible with cookie", () => {
  assert(curlStatus(`-b "${ADMIN_JAR}" "${BASE}/admin"`) === "200", "expected 200");
  assert(curl(`-b "${ADMIN_JAR}" "${BASE}/admin"`).includes("工作台"), "missing dashboard");
});

// TC-12
test("TC-12 Admin assets page loads", () => {
  assert(curlStatus(`-b "${ADMIN_JAR}" "${BASE}/admin/assets"`) === "200", "expected 200");
});

// TC-13
test("TC-13 Dev third-party token", () => {
  const out = execSync(`curl -s -w "\\nHTTP:%{http_code}" "${BASE}/api/dev/third-party-token?u_id=smoke_test_user"`, {
    encoding: "utf8",
  });
  assert(out.includes("HTTP:200") && out.includes('"token"'), `unexpected: ${out}`);
});

// TC-14
test("TC-14 Third-party auth login", () => {
  const tokenOut = curl(`"${BASE}/api/dev/third-party-token?u_id=smoke_test_user"`);
  const token = JSON.parse(tokenOut).token;
  const out = execSync(
    `curl -s -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/auth/third-party" -H "Content-Type: application/json" -d '{"token":"${token}"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200") && out.includes('"ok":true'), `unexpected: ${out}`);
});

// TC-15
test("TC-15 Mobile API blocked without session", () => {
  const out = execSync(
    `curl -s -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/m/drying/reserve" -H "Content-Type: application/json" -d '{"listingId":"x","startDate":"2026-09-10","endDate":"2026-09-10"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:401"), `expected 401, got ${out}`);
});

// TC-16
test("TC-16 Drying reservation (authenticated)", () => {
  assert(listingId, "no OPERATING listing in DB");
  const out = execSync(
    `curl -s -b "${USER_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/m/drying/reserve" -H "Content-Type: application/json" -d '{"listingId":"${listingId}","startDate":"2026-12-10","endDate":"2026-12-12"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200") && out.includes('"ok":true'), `unexpected: ${out}`);
});

// TC-17
test("TC-17 Auction bid blocked without session", () => {
  assert(auctionId, "no LIVE auction in DB");
  const out = execSync(
    `curl -s -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/m/auction/${auctionId}/bid" -H "Content-Type: application/json" -d '{"amount":8000}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:401"), `expected 401, got ${out}`);
});

// TC-18 - bid at current minimum
test("TC-18 Auction bid success", () => {
  assert(auctionId, "no LIVE auction in DB");
  const out = execSync(
    `curl -s -b "${USER_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/m/auction/${auctionId}/bid" -H "Content-Type: application/json" -d '{"amount":${nextBidAmount}}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200") && out.includes('"ok":true'), `unexpected: ${out}`);
});

// TC-19
test("TC-19 Auction bid below minimum increment", () => {
  assert(auctionId, "no LIVE auction in DB");
  const out = execSync(
    `curl -s -b "${USER_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/m/auction/${auctionId}/bid" -H "Content-Type: application/json" -d '{"amount":8100}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:400"), `expected 400, got ${out}`);
});

// TC-20
test("TC-20 Mock payment: auction deposit already paid", () => {
  assert(auctionId, "no LIVE auction in DB");
  const out = execSync(
    `curl -s -b "${USER_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/m/payments/mock" -H "Content-Type: application/json" -d '{"purpose":"AUCTION_DEPOSIT","auctionProjectId":"${auctionId}"}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:409"), `expected 409, got ${out}`);
});

// TC-21
test("TC-21 Upload rejected without admin session", () => {
  execSync('printf "\\x89PNG\\r\\n\\x1a\\n" > /tmp/smoke.png');
  const out = execSync(
    `curl -s -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/upload" -F "file=@/tmp/smoke.png;type=image/png"`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:401"), `expected 401, got ${out}`);
});

// TC-22
test("TC-22 Admin file upload success", () => {
  const out = execSync(
    `curl -s -b "${ADMIN_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/upload" -F "file=@/tmp/smoke.png;type=image/png"`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200") && out.includes('"ok":true'), `unexpected: ${out}`);
});

// TC-23
test("TC-23 Serve uploaded file", () => {
  const uploadOut = execSync(
    `curl -s -b "${ADMIN_JAR}" -X POST "${BASE}/api/upload" -F "file=@/tmp/smoke.png;type=image/png"`,
    { encoding: "utf8" },
  );
  const url = JSON.parse(uploadOut).url;
  assert(url, "no upload url");
  assert(curlStatus(`"${BASE}${url}"`) === "200", "expected 200 for uploaded file");
});

// TC-24
test("TC-24 Admin create asset", () => {
  assert(orgId, "no org in DB");
  const out = execSync(
    `curl -s -b "${ADMIN_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/admin/assets" -F "orgId=${orgId}" -F "type=LAND" -F "name=Smoke Test Asset" -F "locationText=测试地点" -F "status=IDLE"`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:200") && out.includes('"ok":true'), `unexpected: ${out}`);
});

// TC-25
test("TC-25 Mobile auction list + protected page redirect", () => {
  assert(curlStatus(`"${BASE}/m/auction"`) === "200", "auction list expected 200");
  const body = curl(`"${BASE}/m/orders"`);
  assert(
    body.includes("/m/login") || body.includes("NEXT_REDIRECT"),
    "orders should redirect to login for unauthenticated users",
  );
  assert(curlStatus(`-b "${USER_JAR}" "${BASE}/m/orders"`) === "200", "orders with cookie expected 200");
});

// Extra: non-multipart upload returns 400
test("TC-26 Upload non-multipart returns 400", () => {
  const out = execSync(
    `curl -s -b "${ADMIN_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/upload" -H "Content-Type: application/json" -d '{}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:400"), `expected 400, got ${out}`);
});

// Extra: non-multipart asset create returns 400
test("TC-27 Admin asset non-multipart returns 400", () => {
  const out = execSync(
    `curl -s -b "${ADMIN_JAR}" -w "\\nHTTP:%{http_code}" -X POST "${BASE}/api/admin/assets" -H "Content-Type: application/json" -d '{}'`,
    { encoding: "utf8" },
  );
  assert(out.includes("HTTP:400"), `expected 400, got ${out}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failures.length) {
  console.log("Failures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
