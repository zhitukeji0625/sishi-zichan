#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` (not production `npm start`).
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
FAIL=0
COOKIE_DIR=$(mktemp -d)
ADMIN_COOKIE="$COOKIE_DIR/admin.txt"
USER_COOKIE="$COOKIE_DIR/user.txt"

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=1; }

check_code() {
  local name="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (got $actual, expected $expected)"; fi
}

echo "=== Smoke test: $BASE ==="

# 1. Homepage
check_code "Homepage" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" "200"

# 2. Admin login
ADMIN_RESP=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_RESP" | grep -q '"ok":true' && pass "Admin login" || fail "Admin login"

# 3. User login
USER_RESP=$(curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_RESP" | grep -q '"ok":true' && pass "User login" || fail "User login"

# 4. Bad password
check_code "Bad password" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')" "401"

# 5. Third-party token (dev only)
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
echo "$TOKEN_RESP" | grep -q 'token' && pass "Dev third-party token" || fail "Dev third-party token"

# 6. Third-party auth
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
TP_RESP=$(curl -s -X POST "$BASE/api/auth/third-party" -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
echo "$TP_RESP" | grep -q '"ok":true' && pass "Third-party auth" || fail "Third-party auth"

# 7. Find LIVE auction for demo user
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const user = await p.endUser.findUnique({ where: { phone: '13800138000' } });
  if (!user) return;
  const reg = await p.auctionRegistration.findFirst({
    where: { endUserId: user.id, status: 'APPROVED', depositPaid: true, project: { status: 'LIVE' } },
    include: { project: true },
  });
  if (!reg) return;
  const top = await p.auctionBid.findFirst({ where: { projectId: reg.projectId }, orderBy: { amount: 'desc' } });
  const min = top
    ? Number(top.amount) + Number(reg.project.bidStep)
    : Number(reg.project.startPrice);
  console.log(reg.projectId + ' ' + min);
}
main().finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  PID=$(echo "$PROJECT_ID" | cut -d' ' -f1)
  MIN=$(echo "$PROJECT_ID" | cut -d' ' -f2)
  BID_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN}")
  echo "$BID_RESP" | grep -q '"ok":true' && pass "Auction bid" || fail "Auction bid: $BID_RESP"
else
  fail "No LIVE auction for demo user"
fi

# 8. Drying reservation
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { if (r) console.log(r.id); })
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  DRY_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
  echo "$DRY_RESP" | grep -q '"ok":true' && pass "Drying reservation" || fail "Drying reservation: $DRY_RESP"
else
  fail "No operating drying listing"
fi

# 9. Upload without multipart → 400
check_code "Upload non-multipart" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')" "400"

# 10. Admin assets non-multipart → 400
check_code "Assets non-multipart" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')" "400"

# 11. Register duplicate phone → 409
DUP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"test1234","name":"重复"}')
check_code "Duplicate register" "$DUP_CODE" "409"

# 12. Admin dashboard
check_code "Admin dashboard" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" "$BASE/admin")" "200"

# 13. Mobile pages
check_code "Mobile home" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" "$BASE/m")" "200"
check_code "Mobile auction" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" "$BASE/m/auction")" "200"

# 14. Logout
check_code "User logout" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")" "200"
check_code "Admin logout" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/logout")" "200"

# 15. Auth redirect
check_code "Admin unauth redirect" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")" "307"

rm -rf "$COOKIE_DIR"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "Smoke test: ALL PASSED (15 checks)"
else
  echo "Smoke test: FAILED"
  exit 1
fi
