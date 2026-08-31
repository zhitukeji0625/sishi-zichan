#!/usr/bin/env bash
# Functional smoke test for sishi-zichan platform.
# Usage: ./scripts/smoke-test.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_JAR="/tmp/smoke_admin_cookies.txt"
USER_JAR="/tmp/smoke_user_cookies.txt"
rm -f "$ADMIN_JAR" "$USER_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# --- Public pages ---
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# --- Admin auth & pages ---
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_OK=$(echo "$ADMIN_RESP" | grep -c '"ok":true' || true)
check "Admin login API" "1" "$ADMIN_OK"

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/registrations" \
  "/admin/announcements" "/admin/drying" "/admin/dict" "/admin/config" \
  "/admin/audit" "/admin/organizations" "/admin/admins"; do
  code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path (admin)" "200" "$code"
done

# --- User auth & pages ---
USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_OK=$(echo "$USER_RESP" | grep -c '"ok":true' || true)
check "User login API" "1" "$USER_OK"

for path in "/m/me" "/m/orders"; do
  code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path (user)" "200" "$code"
done

# --- Auction detail & bid ---
AUCTION_HTML=$(curl -s -b "$USER_JAR" "$BASE/m/auction")
AUCTION_ID=$(echo "$AUCTION_HTML" | grep -oP '/m/auction/c[a-z0-9]{10,}' | head -1 | sed 's|/m/auction/||')
if [ -n "$AUCTION_ID" ]; then
  code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$AUCTION_ID")
  check "GET /m/auction/$AUCTION_ID" "200" "$code"

  DETAIL=$(curl -s -b "$USER_JAR" "$BASE/m/auction/$AUCTION_ID")
  MIN_BID=$(echo "$DETAIL" | grep -oP '最低 ¥\K[0-9]+(?:\.[0-9]+)?' | head -1 || true)
  if [ -z "$MIN_BID" ]; then
    MIN_BID=$(echo "$DETAIL" | grep -oP 'placeholder="\K[0-9]+(?:\.[0-9]+)?' | head -1 || true)
  fi
  if [ -z "$MIN_BID" ]; then
    MIN_BID=$(echo "$DETAIL" | grep -oP 'min="\K[0-9]+(?:\.[0-9]+)?' | head -1 || true)
  fi
  if [ -z "$MIN_BID" ]; then
    MIN_BID=8000
  fi
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  BID_OK=$(echo "$BID_RESP" | grep -c '"ok":true' || true)
  check "Bid API ($MIN_BID)" "1" "$BID_OK"
  if [ "$BID_OK" != "1" ]; then
    echo "  Bid response: $BID_RESP"
  fi
else
  echo "✗ No auction ID found on /m/auction"
  FAIL=$((FAIL + 1))
fi

# --- Drying detail ---
DRYING_HTML=$(curl -s -b "$USER_JAR" "$BASE/m/drying")
DRYING_ID=$(echo "$DRYING_HTML" | grep -oP '/m/drying/c[a-z0-9]{10,}' | head -1 | sed 's|/m/drying/||')
if [ -n "$DRYING_ID" ]; then
  code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/drying/$DRYING_ID")
  check "GET /m/drying/$DRYING_ID" "200" "$code"
else
  echo "✗ No drying ID found on /m/drying"
  FAIL=$((FAIL + 1))
fi

# --- Dict data ---
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(c => { console.log(c); p.\$disconnect(); });
" 2>/dev/null)
check "Dict categories seeded" "14" "$DICT_COUNT"

# --- Third-party token (disabled in production) ---
TP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")
if [ "${NODE_ENV:-production}" = "production" ]; then
  check "Third-party token API (prod=404)" "404" "$TP_CODE"
else
  check "Third-party token API (dev=200)" "200" "$TP_CODE"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
