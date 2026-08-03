#!/usr/bin/env bash
# Functional smoke tests against local dev server
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [[ "$actual" == "$expected" ]]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "✓ $name (ok)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# 1. Public pages
for path in "/" "/m" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# 2. User login
USER_BODY=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "User login" "$USER_BODY"

# 3. Protected API without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Drying reserve without auth" "401" "$code"

# 4. Admin login
ADMIN_BODY=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "Admin login" "$ADMIN_BODY"

# 5. Upload without multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Upload non-multipart" "400" "$code"

# 6. Upload without file (multipart)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -F "file=")
assert_status "Upload empty file" "400" "$code"

# 7. Admin assets without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -F "name=test")
assert_status "Admin assets without auth" "401" "$code"

# 8. Admin assets invalid org
BODY=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -F "orgId=invalid-org" -F "type=LAND" -F "name=测试" -F "locationText=测试")
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -F "orgId=invalid-org" -F "type=LAND" -F "name=测试" -F "locationText=测试")
if [[ "$code" == "403" || "$code" == "400" ]]; then
  echo "✓ Admin assets invalid org ($code)"
  PASS=$((PASS + 1))
else
  echo "✗ Admin assets invalid org (expected 403/400, got $code) $BODY"
  FAIL=$((FAIL + 1))
fi

# 9. Get live auction project id from DB
PROJECT_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [[ -n "$PROJECT_ID" ]]; then
  BID_BODY=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":100}')
  if echo "$BID_BODY" | grep -qE '"ok":true|"error"'; then
    echo "✓ Auction bid endpoint responds"
    PASS=$((PASS + 1))
  else
    echo "✗ Auction bid: $BID_BODY"
    FAIL=$((FAIL + 1))
  fi
else
  echo "⚠ No LIVE auction project — skipping bid test"
fi

# 10. Drying listing reservation
LISTING_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [[ -n "$LISTING_ID" ]]; then
  START=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d)
  END=$(date -d "+32 days" +%Y-%m-%d 2>/dev/null || date -v+32d +%Y-%m-%d)
  RES_BODY=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$RES_BODY" | grep -q '"ok":true'; then
    echo "✓ Drying reservation"
    PASS=$((PASS + 1))
    # Overlapping reservation should fail
    RES2=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
      -H "Content-Type: application/json" \
      -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
    if [[ "$RES2" == "400" || "$RES2" == "409" ]]; then
      echo "✓ Overlapping drying reservation rejected ($RES2)"
      PASS=$((PASS + 1))
    else
      echo "✗ Overlapping drying reservation (expected 400/409, got $RES2)"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "✗ Drying reservation: $RES_BODY"
    FAIL=$((FAIL + 1))
  fi
else
  echo "⚠ No OPERATING drying listing — skipping drying test"
fi

# 11. Third-party token (dev)
TOKEN_BODY=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test")
if echo "$TOKEN_BODY" | grep -q '"token"'; then
  echo "✓ Dev third-party token"
  PASS=$((PASS + 1))
else
  echo "✗ Dev third-party token: $TOKEN_BODY"
  FAIL=$((FAIL + 1))
fi

# 12. Register validation
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Register empty body" "400" "$code"

# 13. Mock payment without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Mock payment without auth" "401" "$code"

# 14. Admin protected page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
assert_status "Admin dashboard with session" "200" "$code"

# 15. Admin without session redirects
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/admin" 2>/dev/null | tail -1)
# curl -L follows redirect; check redirect location instead
REDIR=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "Admin without session" "307" "$REDIR"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
