#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
USER_JAR="/tmp/sishi-user.cookies"
ADMIN_JAR="/tmp/sishi-admin.cookies"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE ==="
rm -f "$USER_JAR" "$ADMIN_JAR"

echo "--- Public pages ---"
for path in "/" "/m" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE$path")
  check "$path" "200" "$code"
done

echo "--- Auth ---"
user_login=$(curl -sS -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$user_login" | grep -q '"ok":true' && check "user login" "ok" "ok" || check "user login" "ok" "fail"

admin_login=$(curl -sS -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$admin_login" | grep -q '"ok":true' && check "admin login" "ok" "ok" || check "admin login" "ok" "fail"

echo "--- Admin pages ---"
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/dict" "/admin/audit"; do
  code=$(curl -sS -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  check "$path" "200" "$code"
done

echo "--- Dev SSO ---"
sso=$(curl -sS "$BASE/api/dev/third-party-token?u_id=ext_user_001")
echo "$sso" | grep -q '"token"' && check "dev SSO token" "ok" "ok" || check "dev SSO token" "ok" "fail"

echo "--- Auction bid ---"
# Trigger layout refresh to reset demo auction
curl -sS -o /dev/null "$BASE/m/auction"
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ select: { id: true, status: true } })
  .then(r => console.log(r?.id ?? ''))
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  bid=$(curl -sS -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":8400}')
  echo "$bid" | grep -q '"ok":true' && check "place bid" "ok" "ok" || check "place bid" "ok" "fail ($bid)"
else
  check "place bid" "ok" "fail (no project)"
fi

echo "--- Drying reserve ---"
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ select: { id: true } })
  .then(r => console.log(r?.id ?? ''))
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  reserve=$(curl -sS -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
  echo "$reserve" | grep -qE '"ok":true|"error":"该时段已被预约"' && check "drying reserve" "ok" "ok" || check "drying reserve" "ok" "fail ($reserve)"
else
  check "drying reserve" "ok" "fail (no listing)"
fi

echo "--- Dict data ---"
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(c => console.log(c)).finally(() => p.\$disconnect());
" 2>/dev/null)
[ "${DICT_COUNT:-0}" -gt 0 ] && check "dict categories" "ok" "ok" || check "dict categories" "ok" "fail (count=$DICT_COUNT)"

echo "--- Icon ---"
icon_code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/icon")
check "/icon" "200" "$icon_code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
