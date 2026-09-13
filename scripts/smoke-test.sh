#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE (default http://localhost:3000)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp/sishi-smoke}"
mkdir -p "$TMPDIR"
USER_JAR="$TMPDIR/user.jar"
ADMIN_JAR="$TMPDIR/admin.jar"
NEWUSER_JAR="$TMPDIR/newuser.jar"

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1 — $2"; FAIL=$((FAIL + 1)); }

assert_http() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name"; else fail "$name" "expected HTTP $expected, got $actual"; fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then pass "$name"; else fail "$name" "body=$body"; fi
}

echo "=== Smoke tests against $BASE ==="

# 1. Portal
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_http "portal homepage" "200" "$code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_http "admin login page" "200" "$code"

# 3. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_http "mobile home" "200" "$code"

# 4. User login
body=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "user login" "$body"

# 5. Admin login
body=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "admin login" "$body"

# 6. Register new user (unique phone)
REG_PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -c "$NEWUSER_JAR" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$REG_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_json_ok "user register" "$body"

# 7. Dev third-party token
body=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test_user")
if echo "$body" | grep -q '"token"'; then pass "dev third-party token"; else fail "dev third-party token" "body=$body"; fi

# 8. Third-party SSO login
TOKEN=$(echo "$body" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
body=$(curl -s -c "$TMPDIR/sso.jar" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
assert_json_ok "third-party login" "$body"

# 9. Unauthenticated mobile API returns 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-10-01","endDate":"2026-10-02"}')
assert_http "unauth drying reserve" "401" "$code"

# 10. Non-multipart upload returns 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_http "non-multipart upload" "400" "$code"

# 11. Non-multipart asset create returns 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
assert_http "non-multipart asset create" "400" "$code"

# 12. Unauthenticated upload returns 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -F "file=@/dev/null")
assert_http "unauth upload" "401" "$code"

# Lookup DB IDs
DB_INFO=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  const listing = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  const org = await p.organization.findFirst({ where: { code: 'REG61' } });
  if (!proj || !listing || !org) {
    console.log(JSON.stringify({ error: 'missing seed data' }));
    return;
  }
  const top = proj.bids[0]?.amount ? Number(proj.bids[0].amount) : null;
  const start = Number(proj.startPrice);
  const step = Number(proj.bidStep);
  const minBid = top !== null ? top + step : start;
  console.log(JSON.stringify({
    projectId: proj.id,
    listingId: listing.id,
    orgId: org.id,
    minBid,
  }));
}
main().finally(() => p.\$disconnect());
" 2>/dev/null)

PROJECT_ID=$(echo "$DB_INFO" | sed -n 's/.*"projectId":"\([^"]*\)".*/\1/p')
LISTING_ID=$(echo "$DB_INFO" | sed -n 's/.*"listingId":"\([^"]*\)".*/\1/p')
ORG_ID=$(echo "$DB_INFO" | sed -n 's/.*"orgId":"\([^"]*\)".*/\1/p')
MIN_BID=$(echo "$DB_INFO" | sed -n 's/.*"minBid":\([0-9]*\).*/\1/p')

if [ -z "$PROJECT_ID" ] || [ -z "$LISTING_ID" ] || [ -z "$ORG_ID" ]; then
  fail "seed data lookup" "missing LIVE project, listing, or org — run npm run db:seed"
else
  pass "seed data lookup"

  # 13. Bid on LIVE auction
  body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  assert_json_ok "auction bid" "$body"

  # 14. Bid below minimum rejected
  LOW=$((MIN_BID - 50))
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$LOW}")
  assert_http "bid below minimum rejected" "400" "$code"

  # 15. Drying reservation (dynamic dates +10/+11 days)
  START_DATE=$(date -d "+10 days" +%Y-%m-%d 2>/dev/null || date -v+10d +%Y-%m-%d)
  END_DATE=$(date -d "+11 days" +%Y-%m-%d 2>/dev/null || date -v+11d +%Y-%m-%d)
  body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  assert_json_ok "drying reservation" "$body"

  # 16. Admin asset create
  body=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
    -F "orgId=$ORG_ID" \
    -F "type=LAND" \
    -F "name=冒烟测试地块" \
    -F "locationText=测试地址" \
    -F "status=IDLE")
  assert_json_ok "admin asset create" "$body"
fi

# 17. Image upload (create minimal PNG)
PNG="$TMPDIR/test.png"
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$PNG"
body=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/upload" -F "file=@$PNG;type=image/png")
if echo "$body" | grep -q '"url"'; then pass "image upload"; else fail "image upload" "body=$body"; fi

# 18. Fetch uploaded image
UPLOAD_URL=$(echo "$body" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
if [ -n "$UPLOAD_URL" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$UPLOAD_URL")
  assert_http "fetch uploaded image" "200" "$code"
else
  fail "fetch uploaded image" "no upload url"
fi

# 19. User logout
body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/auth/logout")
assert_json_ok "user logout" "$body"

# 20. Admin logout
body=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
assert_json_ok "admin logout" "$body"

# 21. Mobile login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
assert_http "mobile login page" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then exit 1; fi
