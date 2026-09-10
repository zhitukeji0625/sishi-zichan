#!/usr/bin/env bash
# API smoke test — requires dev server on localhost:3000 and seeded DB.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

# 2. Admin login
resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' && { echo "  ✓ admin login"; PASS=$((PASS + 1)); } || { echo "  ✗ admin login: $resp"; FAIL=$((FAIL + 1)); }

# 3. Admin dashboard
code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "GET /admin" "200" "$code"

# 4. User login
resp=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' && { echo "  ✓ user login"; PASS=$((PASS + 1)); } || { echo "  ✗ user login: $resp"; FAIL=$((FAIL + 1)); }

# 5. Mobile pages
code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
assert_status "GET /m/auction" "200" "$code"
code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/drying")
assert_status "GET /m/drying" "200" "$code"

# 6. Upload non-multipart → 400
code=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' \
  -d '{"test":1}' -o /dev/null -w "%{http_code}")
assert_status "POST /api/upload (non-multipart)" "400" "$code"

# 7. Admin assets non-multipart → 400
code=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' \
  -d '{"name":"x"}' -o /dev/null -w "%{http_code}")
assert_status "POST /api/admin/assets (non-multipart)" "400" "$code"

# 8. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=demo_user_1")
assert_status "GET /api/dev/third-party-token" "200" "$code"

# 9. Register
PHONE="199$(date +%s | tail -c 9)"
resp=$(curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"password\":\"user123\",\"name\":\"冒烟测试\"}")
echo "$resp" | grep -q '"ok":true' && { echo "  ✓ register"; PASS=$((PASS + 1)); } || { echo "  ✗ register: $resp"; FAIL=$((FAIL + 1)); }

# 10. Trigger demo auction refresh via homepage
curl -s -o /dev/null "$BASE/"

# 11. Bid on live auction
PROJECT=$(curl -s -b "$USER_JAR" "$BASE/m/auction" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [ -z "$PROJECT" ]; then
  echo "  ✗ no auction project ID found on /m/auction"
  FAIL=$((FAIL + 1))
else
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const p = new PrismaClient();
    async function main() {
      const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
      if (!proj) { console.log('8000'); return; }
      const top = proj.bids[0]?.amount ?? proj.startPrice;
      console.log(Number(top) + Number(proj.bidStep));
    }
    main().finally(() => p.\$disconnect());
  ")
  resp=$(curl -s -b "$USER_JAR" -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$MIN_BID}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  if [ "$code" = "200" ]; then
    echo "  ✓ bid on $PROJECT (amount=$MIN_BID)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ bid on $PROJECT: $body (HTTP $code)"
    FAIL=$((FAIL + 1))
  fi
fi

# 12. Drying reserve
LISTING=$(cd "$(dirname "$0")/.." && npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const p = new PrismaClient();
  p.dryingFieldListing.findFirst().then(l => { console.log(l?.id ?? ''); }).finally(() => p.\$disconnect());
")
if [ -z "$LISTING" ]; then
  echo "  ✗ no drying listing found"
  FAIL=$((FAIL + 1))
else
  resp=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
  echo "$resp" | grep -q '"ok":true' && { echo "  ✓ drying reserve"; PASS=$((PASS + 1)); } || { echo "  ✗ drying reserve: $resp"; FAIL=$((FAIL + 1)); }
fi

# 13. Admin pages
for path in /admin/assets /admin/auctions /admin/registrations /admin/drying; do
  code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# 14. SSO page
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=demo_user_1" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
assert_status "GET /m/sso" "200" "$code"

# 15. Logout
code=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/auth/logout" -o /dev/null -w "%{http_code}")
assert_status "POST /api/auth/logout" "200" "$code"
code=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout" -o /dev/null -w "%{http_code}")
assert_status "POST /api/auth/admin/logout" "200" "$code"

# 16. Protected route without auth
code=$(curl -s -X POST "$BASE/api/m/drying/reserve" \
  -H 'Content-Type: application/json' \
  -d '{"listingId":"x","startDate":"2026-10-01","endDate":"2026-10-03"}' -o /dev/null -w "%{http_code}")
assert_status "POST /api/m/drying/reserve (no auth)" "401" "$code"

# 17. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "GET /m" "200" "$code"

# 18. Announcement page
ANN=$(cd "$(dirname "$0")/.." && npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const p = new PrismaClient();
  p.announcement.findFirst({ where: { status: 'PUBLISHED' } }).then(a => { console.log(a?.id ?? ''); }).finally(() => p.\$disconnect());
")
if [ -n "$ANN" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/announcements/$ANN")
  assert_status "GET /m/announcements/[id]" "200" "$code"
fi

# 19. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
