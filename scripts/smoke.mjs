#!/usr/bin/env node
/**
 * HTTP smoke tests against a running dev server (default http://localhost:3000).
 * Requires MariaDB seeded and `npm run dev`.
 */
import { execSync } from "node:child_process";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
let pass = 0;
let fail = 0;

function check(name, expected, actual) {
  if (actual === expected) {
    console.log(`✓ ${name}`);
    pass++;
  } else {
    console.log(`✗ ${name} (expected ${expected}, got ${actual})`);
    fail++;
  }
}

async function curl(args) {
  const cmd = `curl -s ${args}`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

async function curlCode(args) {
  const cmd = `curl -s -o /dev/null -w '%{http_code}' ${args}`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function dbQuery(sql) {
  try {
    return execSync(
      `sudo docker exec mariadb mariadb -uroot -proot -N sishi -e ${JSON.stringify(sql)}`,
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}

const cookieUser = "/tmp/smoke-user.txt";
const cookieAdmin = "/tmp/smoke-admin.txt";

// Pages
check("GET /", "200", await curlCode(`"${BASE}/"`));
check("GET /m", "200", await curlCode(`"${BASE}/m"`));
check("GET /admin/login", "200", await curlCode(`"${BASE}/admin/login"`));
check("GET /m/auction", "200", await curlCode(`"${BASE}/m/auction"`));
check("GET /m/drying", "200", await curlCode(`"${BASE}/m/drying"`));

// User login
const userResp = await curl(
  `-c ${cookieUser} -X POST "${BASE}/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}'`,
);
check("User login ok", "true", JSON.parse(userResp).ok === true ? "true" : "false");

// Admin login
const adminResp = await curl(
  `-c ${cookieAdmin} -X POST "${BASE}/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}'`,
);
check("Admin login ok", "true", JSON.parse(adminResp).ok === true ? "true" : "false");

check("Admin dashboard", "200", await curlCode(`-b ${cookieAdmin} "${BASE}/admin"`));
check("Bad password 401", "401", await curlCode(
  `-X POST "${BASE}/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}'`,
));

// SSO
const tp = JSON.parse(await curl(`"${BASE}/api/dev/third-party-token?u_id=smoke-user"`));
if (tp.token) {
  check("SSO login page", "200", await curlCode(`-c /tmp/smoke-sso.txt "${BASE}/m/sso?token=${tp.token}"`));
} else {
  check("Third party token", "true", "false");
}

// Bid
const projectId = dbQuery("SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1");
if (projectId) {
  const topBid = dbQuery(`SELECT COALESCE(MAX(amount), 0) FROM AuctionBid WHERE projectId='${projectId}'`);
  const startPrice = dbQuery(`SELECT startPrice FROM AuctionProject WHERE id='${projectId}'`);
  const bidStep = dbQuery(`SELECT bidStep FROM AuctionProject WHERE id='${projectId}'`);
  const top = parseFloat(topBid) || 0;
  const start = parseFloat(startPrice) || 8000;
  const step = parseFloat(bidStep) || 200;
  const minBid = top > 0 ? top + step : start;
  const bid = JSON.parse(
    await curl(
      `-b ${cookieUser} -X POST "${BASE}/api/m/auction/${projectId}/bid" -H "Content-Type: application/json" -d '{"amount":${minBid}}'`,
    ),
  );
  check("Bid placement", "true", bid.ok === true ? "true" : "false");
  check("Low bid rejected 400", "400", await curlCode(
    `-b ${cookieUser} -X POST "${BASE}/api/m/auction/${projectId}/bid" -H "Content-Type: application/json" -d '{"amount":${minBid + step / 2}}'`,
  ));
} else {
  check("LIVE auction exists", "true", "false");
}

// Drying
const listingId = dbQuery("SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1");
if (listingId) {
  const dayOffset = 20 + Math.floor(Date.now() / 86400000) % 30;
  const start = new Date(Date.now() + dayOffset * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + (dayOffset + 1) * 86400000).toISOString().slice(0, 10);
  const res = JSON.parse(
    await curl(
      `-b ${cookieUser} -X POST "${BASE}/api/m/drying/reserve" -H "Content-Type: application/json" -d '{"listingId":"${listingId}","startDate":"${start}","endDate":"${end}"}'`,
    ),
  );
  check("Drying reserve", "true", res.ok === true ? "true" : "false");
  check("Overlap reserve rejected 400", "400", await curlCode(
    `-b ${cookieUser} -X POST "${BASE}/api/m/drying/reserve" -H "Content-Type: application/json" -d '{"listingId":"${listingId}","startDate":"${start}","endDate":"${end}"}'`,
  ));
} else {
  check("Drying listing exists", "true", "false");
}

check("Upload without file 400", "400", await curlCode(`-b ${cookieAdmin} -X POST "${BASE}/api/upload"`));
check("Duplicate register 409", "409", await curlCode(
  `-X POST "${BASE}/api/auth/register" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123","name":"dup"}'`,
));

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
