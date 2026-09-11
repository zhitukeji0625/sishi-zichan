#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
PASS=0
FAIL=0

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR" "$USER_JAR"; }
trap cleanup EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name expected $expected got $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests against $BASE ==="

# 1. Portal
assert_status "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"

# 2. Admin login page
assert_status "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# 3. H5 home
assert_status "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"

# 4. H5 auction list
assert_status "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"

# 5. H5 drying list
assert_status "GET /m/drying" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

# 6. Admin login API
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_status "POST /api/auth/admin/login" 200 "$(echo "$ADMIN_RESP" | grep -q '"ok":true' && echo 200 || echo 401)"

# 7. Admin dashboard (with cookie)
assert_status "GET /admin (authenticated)" 200 "$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin")"

# 8. Upload without multipart -> 400 not 500
UPLOAD_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' -d '{}')
assert_status "POST /api/upload non-multipart" 400 "$UPLOAD_CODE"

# 9. Admin assets without multipart -> 400 not 500
ASSET_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{}')
assert_status "POST /api/admin/assets non-multipart" 400 "$ASSET_CODE"

# 10. User login
USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
assert_status "POST /api/auth/login" 200 "$(echo "$USER_RESP" | grep -q '"ok":true' && echo 200 || echo 401)"

# 11. User register (unique phone)
REG_PHONE="199$(date +%s | tail -c 10)"
REG_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$REG_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟用户\"}")
assert_status "POST /api/auth/register" 200 "$(echo "$REG_RESP" | grep -q '"ok":true' && echo 200 || echo 400)"

# 12. Dev third-party token
TP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=smoke-test")
assert_status "GET /api/dev/third-party-token" 200 "$TP_CODE"

# 13. Bid on live project
DB_JSON=$(cd /workspace && npx tsx scripts/db-query.ts 2>/dev/null)
PROJECT_ID=$(echo "$DB_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.projects[0]?.id||'');")
if [[ -z "$PROJECT_ID" ]]; then
  echo "✗ No LIVE auction project in DB"
  FAIL=$((FAIL + 1))
else
  # Get current high bid to compute min bid
  MIN_BID=$(cd /workspace && npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    async function main() {
      const p = new PrismaClient();
      const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
      if (!proj) { console.log('0'); return; }
      const top = proj.bids[0]?.amount;
      const base = top ?? proj.startPrice;
      const min = Number(base) + Number(proj.bidStep);
      console.log(min);
      await p.\$disconnect();
    }
    main();
  " 2>/dev/null)
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$MIN_BID}")
  assert_status "POST /api/m/auction/bid" 200 "$(echo "$BID_RESP" | grep -q '"ok":true' && echo 200 || echo 400)"
  assert_status "GET /m/auction/$PROJECT_ID" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction/$PROJECT_ID")"
fi

# 14. Drying reservation
LISTING_ID=$(echo "$DB_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.listings[0]?.id||'');")
if [[ -z "$LISTING_ID" ]]; then
  echo "✗ No OPERATING drying listing in DB"
  FAIL=$((FAIL + 1))
else
  START=$(date -d '+3 days' +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d '+4 days' +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  DRY_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_status "POST /api/m/drying/reserve" 200 "$(echo "$DRY_RESP" | grep -q '"ok":true' && echo 200 || echo 400)"
  assert_status "GET /m/drying/$LISTING_ID" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying/$LISTING_ID")"
fi

# 15. Unauthenticated bid -> 401
if [[ -n "${PROJECT_ID:-}" ]]; then
  assert_status "POST bid unauthenticated" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d '{"amount":99999}')"
fi

# 16. Invalid register params -> 400
assert_status "POST /api/auth/register invalid" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' -d '{"phone":"123","password":"x"}')"

# 17. Admin logout
assert_status "POST /api/auth/admin/logout" 200 "$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/logout")"

# 18. User logout
assert_status "POST /api/auth/logout" 200 "$(curl -s -b "$USER_JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/logout")"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
