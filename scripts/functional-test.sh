#!/usr/bin/env bash
# 功能完整性冒烟测试（需 dev server 运行于 localhost:3000）
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local name="$1" resp="$2" pattern="$3"
  if echo "$resp" | grep -q "$pattern"; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name: $resp"
    FAIL=$((FAIL + 1))
  fi
}

USER_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$USER_JAR" "$ADMIN_JAR"' EXIT

# Public pages
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# Auth
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json "Admin login" "$ADMIN_RESP" '"ok":true'

USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json "User login" "$USER_RESP" '"ok":true'

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check "GET /admin (authenticated)" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE/m/me")
check "GET /m/me (authenticated)" "200" "$code"

# Unauthenticated protection
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
if [ "$code" = "307" ] || [ "$code" = "302" ]; then
  echo "✓ Unauthenticated admin redirect"
  PASS=$((PASS + 1))
else
  echo "✗ Unauthenticated admin redirect (got $code)"
  FAIL=$((FAIL + 1))
fi

# Dict labels present in auction list HTML
AUCTION_HTML=$(curl -s "$BASE/m/auction")
if echo "$AUCTION_HTML" | grep -q "进行中\|已结束\|待开始"; then
  echo "✓ Auction status labels rendered"
  PASS=$((PASS + 1))
else
  echo "✗ Auction status labels missing (dict not seeded?)"
  FAIL=$((FAIL + 1))
fi

# Demo auction bid
PROJECT_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then((r) => { console.log(r?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":8000}')
  check_json "Demo auction bid" "$BID_RESP" '"ok":true'
else
  echo "✗ No LIVE auction project found"
  FAIL=$((FAIL + 1))
fi

# Drying reservation
LISTING_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ select: { id: true } })
  .then((r) => { console.log(r?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null)
START=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
END=$(date -u -d "+4 days" +%Y-%m-%d 2>/dev/null || date -u -v+4d +%Y-%m-%d)
DRY_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
check_json "Drying reservation" "$DRY_RESP" '"ok":true'

# Third-party auth
TP=$(curl -s "$BASE/api/dev/third-party-token?phone=13800138000")
check_json "Dev third-party token" "$TP" '"token"'

echo ""
echo "=== Functional test: $PASS passed, $FAIL failed ==="
exit "$FAIL"
