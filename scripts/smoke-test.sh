#!/usr/bin/env bash
# Functional smoke test — run against dev server on localhost:3000
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL+1))
  fi
}

for path in / /m /m/login /m/register /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

code=$(curl -s -c "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check "Admin login" "200" "$code"

code=$(curl -s -c "$TMPDIR/user.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check "User login" "200" "$code"

for path in /admin /admin/assets /admin/auctions /admin/drying /admin/organizations /admin/admins /admin/announcements /admin/registrations /admin/audit /admin/config /admin/dict; do
  code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -L "$BASE$path")
  check "GET $path (admin)" "200" "$code"
done

for path in /m /m/auction /m/drying /m/me /m/orders; do
  code=$(curl -s -b "$TMPDIR/user.txt" -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path (user)" "200" "$code"
done

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
check "Dev third-party token" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" -H "Content-Type: application/json" -d '{"amount":100}')
check "Bid without auth" "401" "$code"

PHONE="199$(date +%s | tail -c 9)"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check "Register new user" "200" "$code"

LISTING=$(cd "$(dirname "$0")/.." && npx tsx -e "import{PrismaClient as P}from'@prisma/client';const p=new P();p.dryingFieldListing.findFirst().then(d=>{console.log(d?.id);p.\$disconnect()})" 2>/dev/null)
resp=$(curl -s -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
echo "$resp" | grep -q '"ok":true' && check "Drying reserve" "200" "200" || check "Drying reserve" "200" "fail" "$resp"

code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{"orgId":"x","type":"LAND","name":"test","locationText":"test"}')
check "Asset API rejects JSON" "400" "$code"

code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check "Upload rejects non-multipart" "400" "$code"

code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/logout")
check "Admin logout" "200" "$code"

code=$(curl -s -b "$TMPDIR/user.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/logout")
check "User logout" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
