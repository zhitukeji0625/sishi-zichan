#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE (default http://localhost:3000)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/ft_user_cookies.txt}"
ADMIN_JAR="${ADMIN_JAR:-/tmp/ft_admin_cookies.txt}"
PASS=0
FAIL=0

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expect, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# Ensure demo auction is live
npm run db:seed --silent 2>/dev/null || npm run db:seed

# Wait for server
for i in $(seq 1 30); do
  if curl -sf -o /dev/null "$BASE/"; then break; fi
  sleep 1
done

check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "GET /m/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"

check "POST /api/auth/login bad" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"bad","password":"bad"}')"
check "POST /api/auth/login ok" "200" "$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')"
check "POST /api/auth/admin/login ok" "200" "$(curl -s -o /dev/null -w '%{http_code}' -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')"

check "POST /api/admin/assets no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" -F 'orgId=x' -F 'type=LAND' -F 'name=test' -F 'locationText=loc')"
check "POST /api/admin/assets json" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{"orgId":"x"}')"

PROJECT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  console.log(proj?.id || '');
  await p.\$disconnect();
})();
" 2>/dev/null)

LISTING=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id || '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -z "$PROJECT" ]; then
  echo "FAIL: no LIVE auction project found"
  FAIL=$((FAIL + 1))
else
  check "POST bid no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/$PROJECT/bid" -H 'Content-Type: application/json' -d '{"amount":99999}')"

  MIN_BID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
(async () => {
  const p = new PrismaClient();
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT' } });
  const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT' }, orderBy: { amount: 'desc' } });
  const min = top
    ? new Decimal(top.amount.toString()).plus(proj!.bidStep.toString())
    : new Decimal(proj!.startPrice.toString());
  console.log(min.toFixed(2));
  await p.\$disconnect();
})();
" 2>/dev/null)

  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT/bid" -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  if echo "$BID_RESP" | grep -q '"ok":true'; then
    echo "PASS: POST bid ok ($MIN_BID)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: POST bid ($BID_RESP)"
    FAIL=$((FAIL + 1))
  fi
fi

check "POST drying no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING\",\"startDate\":\"2026-08-01\",\"endDate\":\"2026-08-02\"}")"
check "POST drying bad params" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d '{}')"
check "POST drying reserve" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING\",\"startDate\":\"2026-08-01\",\"endDate\":\"2026-08-02\"}")"

check "GET dev token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123")"
check "GET /admin with auth" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -L "$BASE/admin")"
check "GET /m with auth" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m")"
check "POST logout user" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")"

echo "=== RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
