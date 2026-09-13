#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

assert_code() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== Smoke tests against $BASE ==="

# 1. Public pages
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_code "GET $path" "200" "$code"
done

# 2. Admin login
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_code "POST /api/auth/admin/login" "200" "$code"

# 3. Admin pages (with session)
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/registrations" "/admin/drying" "/admin/organizations"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  assert_code "GET $path (admin)" "200" "$code"
done

# 4. User login
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_code "POST /api/auth/login" "200" "$code"

# 5. User pages
for path in "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  assert_code "GET $path (user)" "200" "$code"
done

# 6. Unauthenticated API protection
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_code "POST bid without auth" "401" "$code"

# 7. Register new user
PHONE="199$(date +%s | tail -c 9)"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_code "POST /api/auth/register" "200" "$code"

# 8. Invalid login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrongpass"}')
assert_code "POST login wrong password" "401" "$code"

# 9. Upload without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_code "POST /api/upload no auth" "401" "$code"

# 10. Upload non-multipart (should be 400, not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"file":"test"}')
assert_code "POST /api/upload non-multipart" "400" "$code"

# 11. Admin assets non-multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
assert_code "POST /api/admin/assets non-multipart" "400" "$code"

# 12. Drying reserve without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-12-01","endDate":"2026-12-02"}')
assert_code "POST drying/reserve no auth" "401" "$code"

# 13. Drying reserve with auth (dynamic listing + dates)
LISTING_ID=$(cd /workspace && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
console.log(l?.id ?? '');
await p.\$disconnect();
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+10 days" +%Y-%m-%d 2>/dev/null || date -v+10d +%Y-%m-%d)
  END=$(date -d "+11 days" +%Y-%m-%d 2>/dev/null || date -v+11d +%Y-%m-%d)
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_code "POST drying/reserve" "200" "$code"
else
  fail "No OPERATING drying listing found"
fi

# 14. Auction bid (dynamic project)
PROJECT_INFO=$(cd /workspace && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
if (!proj) { await p.\$disconnect(); process.exit(0); }
const top = proj.bids[0]?.amount;
const min = top ? Number(top) + Number(proj.bidStep) : Number(proj.startPrice);
console.log(proj.id + ' ' + min);
await p.\$disconnect();
" 2>/dev/null)

if [ -n "$PROJECT_INFO" ]; then
  PID=$(echo "$PROJECT_INFO" | awk '{print $1}')
  MIN=$(echo "$PROJECT_INFO" | awk '{print $2}')
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN}")
  assert_code "POST auction bid" "200" "$code"
else
  fail "No LIVE auction project found"
fi

# 15. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test")
assert_code "GET /api/dev/third-party-token" "200" "$code"

# 16. Logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
assert_code "POST /api/auth/logout" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
assert_code "POST /api/auth/admin/logout" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
