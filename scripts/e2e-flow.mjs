/**
 * End-to-end flow: LIVE auction bid + mock payment + third-party SSO
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function req(method, path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
  if (opts.cookies) headers.Cookie = opts.cookies;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 300);
  }
  return { status: res.status, json, setCookie };
}

function mergeCookies(existing, setCookie) {
  const jar = new Map();
  for (const part of (existing ?? "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k && v) jar.set(k, v);
  }
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    if (k && v) jar.set(k.trim(), v);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const failures = [];
function assert(name, cond, detail = "") {
  if (!cond) {
    failures.push(name);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  } else console.log(`OK: ${name}`);
}

async function main() {
  const { execSync } = await import("node:child_process");
  const q = (sql) =>
    execSync(`sudo docker exec mariadb mariadb -uroot -proot sishi -N -e ${JSON.stringify(sql)}`, {
      encoding: "utf8",
    }).trim();

  // Ensure one LIVE project with approved registration for demo user
  const userId = q("SELECT id FROM EndUser WHERE phone='13800138000' LIMIT 1");
  let projectId = q(
    `SELECT p.id FROM AuctionProject p INNER JOIN AuctionRegistration r ON r.projectId=p.id WHERE p.status='LIVE' AND r.endUserId='${userId}' AND r.status='APPROVED' AND r.depositPaid=1 LIMIT 1`,
  );
  if (!projectId) {
    const assetId = q("SELECT id FROM Asset LIMIT 1");
    projectId = `e2e_${Date.now()}`;
    q(
      `INSERT INTO AuctionProject (id, code, assetId, startPrice, bidStep, startsAt, endsAt, depositAmount, status, createdAt, updatedAt) VALUES ('${projectId}', 'E2E${Date.now()}', '${assetId}', 1000, 100, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 200, 'LIVE', NOW(), NOW())`,
    );
    q(
      `INSERT INTO AuctionRegistration (id, projectId, endUserId, status, depositPaid, createdAt, updatedAt) VALUES (CONCAT('reg_', '${projectId}'), '${projectId}', '${userId}', 'APPROVED', 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE status='APPROVED', depositPaid=1`,
    );
    console.log("Created LIVE project:", projectId);
  }

  const login = await req("POST", "/api/auth/login", {
    body: { phone: "13800138000", password: "user123" },
  });
  let cookies = mergeCookies("", login.setCookie);
  assert("login", login.status === 200);

  const startPrice = Number(q(`SELECT startPrice FROM AuctionProject WHERE id='${projectId}'`));
  const bidStep = Number(q(`SELECT bidStep FROM AuctionProject WHERE id='${projectId}'`));
  const topBid = q(
    `SELECT COALESCE(MAX(amount), 0) FROM AuctionBid WHERE projectId='${projectId}'`,
  );
  const minNext = topBid && Number(topBid) > 0 ? Number(topBid) + bidStep : startPrice;

  const bid1 = await req("POST", `/api/m/auction/${projectId}/bid`, {
    cookies,
    body: { amount: minNext },
  });
  assert("bid at min increment", bid1.status === 200 && bid1.json?.ok, JSON.stringify(bid1.json));

  const bid2 = await req("POST", `/api/m/auction/${projectId}/bid`, {
    cookies,
    body: { amount: minNext + bidStep },
  });
  assert("second bid increment", bid2.status === 200 && bid2.json?.ok, JSON.stringify(bid2.json));

  const bidLow = await req("POST", `/api/m/auction/${projectId}/bid`, {
    cookies,
    body: { amount: minNext + 1 },
  });
  assert("reject low bid", bidLow.status === 400, JSON.stringify(bidLow.json));

  // Mock deposit payment for a new registration scenario
  const pay = await req("POST", "/api/m/payments/mock", {
    cookies,
    body: { purpose: "AUCTION_DEPOSIT", auctionProjectId: projectId },
  });
  // May be 409 if already paid — both acceptable
  assert(
    "mock deposit payment",
    pay.status === 200 || pay.status === 409,
    `${pay.status} ${JSON.stringify(pay.json)}`,
  );

  // Third-party SSO flow
  const tpt = await req("GET", "/api/dev/third-party-token?phone=13800138000");
  assert("dev token", tpt.status === 200 && tpt.json?.token);
  const sso = await req("POST", "/api/auth/third-party", { body: { token: tpt.json.token } });
  assert("third-party login", sso.status === 200 && sso.json?.ok, JSON.stringify(sso.json));

  // Register duplicate phone
  const dup = await req("POST", "/api/auth/register", {
    body: { phone: "13800138000", password: "user1234" },
  });
  assert("register duplicate", dup.status === 409);

  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`, failures);
    process.exit(1);
  }
  console.log("\nE2E flow passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
