#!/usr/bin/env bash
# 冒烟测试：从仓库根目录运行 npm run test:smoke
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ERRORS=""

check_http() {
  local name="$1"
  local expected="$2"
  local url="$3"
  local cookies="${4:-}"
  local actual
  if [ -n "$cookies" ]; then
    actual=$(curl -s -o /dev/null -w '%{http_code}' -b "$cookies" "$url")
  else
    actual=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  fi
  if [ "$expected" = "$actual" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n- $name: expected $expected, got $actual"
  fi
}

check_json_ok() {
  local name="$1"
  local resp="$2"
  local ok
  ok=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'fail')" 2>/dev/null || echo "parse_error")
  if [ "$ok" = "ok" ] || [ "$ok" = "True" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name: $resp"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n- $name: $resp"
  fi
}

# Public pages
check_http "Home /" "200" "$BASE/"
check_http "Mobile /m" "200" "$BASE/m"
check_http "Mobile login" "200" "$BASE/m/login"
check_http "Mobile auction list" "200" "$BASE/m/auction"
check_http "Mobile drying list" "200" "$BASE/m/drying"
check_http "Admin login" "200" "$BASE/admin/login"

# User login
USER_RESP=$(curl -s -c /tmp/smoke_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "User login API" "$USER_RESP"

check_http "User /m/me" "200" "$BASE/m/me" "/tmp/smoke_user.txt"
check_http "User /m/orders" "200" "$BASE/m/orders" "/tmp/smoke_user.txt"

# Admin login (must use admin endpoint)
ADMIN_RESP=$(curl -s -c /tmp/smoke_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "Admin login API" "$ADMIN_RESP"

check_http "Admin dashboard" "200" "$BASE/admin" "/tmp/smoke_admin.txt"
check_http "Admin assets" "200" "$BASE/admin/assets" "/tmp/smoke_admin.txt"
check_http "Admin auctions" "200" "$BASE/admin/auctions" "/tmp/smoke_admin.txt"
check_http "Admin drying" "200" "$BASE/admin/drying" "/tmp/smoke_admin.txt"
check_http "Admin dict" "200" "$BASE/admin/dict" "/tmp/smoke_admin.txt"

# Upload: non-multipart should be 400
UPLOAD_BAD=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
if [ "$UPLOAD_BAD" = "400" ]; then
  echo "✓ Upload non-multipart returns 400"
  PASS=$((PASS + 1))
else
  echo "✗ Upload non-multipart (expected 400, got $UPLOAD_BAD)"
  FAIL=$((FAIL + 1))
  ERRORS="${ERRORS}\n- Upload non-multipart: expected 400, got $UPLOAD_BAD"
fi

# Dict data exists
DICT_COUNT=$(npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dictCategory.count().then(c => { console.log(c); p.\$disconnect(); });
" 2>/dev/null | tail -1)
if [ "${DICT_COUNT:-0}" -gt 0 ]; then
  echo "✓ Dict categories seeded ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "✗ Dict categories missing"
  FAIL=$((FAIL + 1))
  ERRORS="${ERRORS}\n- Dict categories missing"
fi

# Bid on LIVE demo auction
BID_INFO=$(npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const user = await p.endUser.findUnique({ where: { phone: '13800138000' } });
  const reg = await p.auctionRegistration.findFirst({
    where: { endUserId: user.id, status: 'APPROVED', depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!reg || reg.project.status !== 'LIVE') {
    console.log('SKIP');
    return;
  }
  const top = await p.auctionBid.findFirst({
    where: { projectId: reg.projectId },
    orderBy: { amount: 'desc' },
  });
  const min = top
    ? Number(top.amount) + Number(reg.project.bidStep)
    : Number(reg.project.startPrice);
  console.log(reg.project.id + ' ' + min);
}
main().finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

if [ "$BID_INFO" = "SKIP" ]; then
  echo "✗ No LIVE demo auction for bid test"
  FAIL=$((FAIL + 1))
  ERRORS="${ERRORS}\n- No LIVE demo auction"
else
  PROJECT_ID=$(echo "$BID_INFO" | awk '{print $1}')
  MIN_BID=$(echo "$BID_INFO" | awk '{print $2}')
  BID_RESP=$(curl -s -b /tmp/smoke_user.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  check_json_ok "Bid on LIVE auction" "$BID_RESP"
fi

# Unauthenticated API protection
UNAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-10-01","endDate":"2026-10-02"}')
if [ "$UNAUTH" = "401" ]; then
  echo "✓ Unauthenticated API returns 401"
  PASS=$((PASS + 1))
else
  echo "✗ Unauthenticated API (expected 401, got $UNAUTH)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Smoke test: $PASS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then
  echo "Errors:$ERRORS"
  exit 1
fi
