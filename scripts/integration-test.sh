#!/bin/bash
# Integration smoke tests for key flows
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=1; }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

# Public pages
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

# User login
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$LOGIN" | grep -q '"ok":true' && pass "user login" || fail "user login: $LOGIN"

# Admin login
ALOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ALOGIN" | grep -q '"ok":true' && pass "admin login" || fail "admin login: $ALOGIN"

# Protected without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check_status "bid without auth" "401" "$code"

# Get live auction project id from DB
PROJECT_ID=$(cd /workspace && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } })
  .then(proj => { console.log(proj?.id || ''); return p.\$disconnect(); });
")

if [ -n "$PROJECT_ID" ]; then
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":8400}')
  echo "$BID" | grep -q '"ok":true' && pass "place bid" || fail "place bid: $BID"
else
  fail "no LIVE auction project in DB"
fi

# Admin protected page
code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
check_status "admin dashboard with cookie" "200" "$code"

# Invalid login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check_status "wrong password" "401" "$code"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "All integration tests passed."
  exit 0
else
  echo ""
  echo "Some integration tests failed."
  exit 1
fi
