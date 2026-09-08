#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE (default http://localhost:3000)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$USER_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual) body=$body"
    FAIL=$((FAIL + 1))
  fi
}

# Trigger layout hooks (demo auction refresh)
curl -s -o /dev/null "$BASE/" || true

for path in "/" "/m" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
check "admin redirect" "307" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke")
check "third-party token" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"wrong"}')
check "admin login wrong pwd" "401" "$code"

curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}' > /dev/null

body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d "{}")
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d "{}")
check "upload non-multipart" "400" "$code" "$body"

body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d "{}")
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d "{}")
check "asset non-multipart" "400" "$code" "$body"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: multipart/form-data" -F "file=@/dev/null;type=image/jpeg")
check "upload no auth" "401" "$code"

curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null

token=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).token")
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" -d "{\"token\":\"$token\"}")
check "third-party auth" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check "bid no auth" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{}')
check "drying invalid params" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{}')
check "register invalid" "400" "$code"

read -r PID AMT < <(node --import tsx/esm -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  const top = proj ? await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' } }) : null;
  const step = Number(proj?.bidStep ?? 200);
  const start = Number(proj?.startPrice ?? 8000);
  const next = top ? Number(top.amount) + step : start;
  process.stdout.write((proj?.id ?? '') + ' ' + next + '\n');
  await p.\$disconnect();
})();
")

if [ -n "$PID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$AMT}")
  code=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | sed '$d')
  check "auction bid" "200" "$code" "$body"
else
  echo "FAIL: auction bid (no LIVE project found)"
  FAIL=$((FAIL + 1))
fi

LISTING_ID=$(node --import tsx/esm -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  process.stdout.write((l?.id ?? '') + '\n');
  await p.\$disconnect();
})();
")

if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+4 days" +%Y-%m-%d)
  END=$(date -u -d "+5 days" +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | sed '$d')
  check "drying reserve" "200" "$code" "$body"
else
  echo "FAIL: drying reserve (no OPERATING listing found)"
  FAIL=$((FAIL + 1))
fi

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
