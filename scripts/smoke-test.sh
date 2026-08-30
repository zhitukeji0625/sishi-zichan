#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local expect="$2"
  local actual="$3"
  if [[ "$actual" == "$expect" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expect, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

# 1. Portal
check "portal" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"

# 2. Mobile pages
check "m home" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "m login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "m auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "m drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

# 3. Admin login page
check "admin login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# 4. User login API
USER_RES=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c /tmp/smoke_user.txt -w '%{http_code}')
USER_CODE="${USER_RES: -3}"
check "user login API" "200" "$USER_CODE"

# 5. Admin login API
ADMIN_RES=$(curl -s -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c /tmp/smoke_admin.txt -w '%{http_code}')
ADMIN_CODE="${ADMIN_RES: -3}"
check "admin login API" "200" "$ADMIN_CODE"

# 6. Dev third-party token
check "dev token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=smoke")"

# 7. Admin pages (authenticated)
check "admin dashboard" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt "$BASE/admin")"
check "admin dict" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt "$BASE/admin/dict")"
check "admin drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt "$BASE/admin/drying")"
check "admin assets" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt "$BASE/admin/assets")"
check "admin auctions" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt "$BASE/admin/auctions")"

# 8. Icon / favicon
check "app icon" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/icon")"

# 9. Trigger layout refresh (demo auction reset)
curl -s -o /dev/null "$BASE/"

# 10. LIVE auction should exist
AUCTION_HTML=$(curl -s "$BASE/m/auction")
if echo "$AUCTION_HTML" | grep -q "status-live\|进行中\|LIVE"; then
  echo "  ✓ live auction listed"
  PASS=$((PASS + 1))
else
  echo "  ✗ no LIVE auction found on /m/auction"
  FAIL=$((FAIL + 1))
fi

# 11. Dict categories in HTML (server-rendered)
DICT_TMP=$(mktemp)
curl -s -b /tmp/smoke_admin.txt "$BASE/admin/dict" > "$DICT_TMP"
if grep -qE 'asset_type|资产类型' "$DICT_TMP"; then
  echo "  ✓ dict categories rendered"
  PASS=$((PASS + 1))
else
  echo "  ✗ dict categories missing in /admin/dict"
  FAIL=$((FAIL + 1))
fi
rm -f "$DICT_TMP"

# 12. Bid API on LIVE auction
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { if (r) console.log(r.id); })
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)
if [[ -n "${PROJECT_ID:-}" ]]; then
  TOP=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
  const min = top ? Number(top.amount) + Number(proj?.bidStep ?? 200) : Number(proj?.startPrice ?? 8000);
  console.log(min);
}
main().finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)
  BID_RES=$(curl -s -b /tmp/smoke_user.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$TOP}" -w '%{http_code}')
  BID_CODE="${BID_RES: -3}"
  check "bid API" "200" "$BID_CODE"
else
  echo "  ✗ no LIVE project for bid test"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
