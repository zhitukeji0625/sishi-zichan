#!/usr/bin/env bash
# 冒烟测试：验证核心页面与 API（需 dev server 运行于 BASE_URL）
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_PHONE="13900000001"
ADMIN_PASS="admin123"
USER_PHONE="13800138000"
USER_PASS="user123"
PASS=0
FAIL=0
ADMIN_COOKIE="/tmp/smoke_admin_cookies.txt"
USER_COOKIE="/tmp/smoke_user_cookies.txt"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  OK  $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('ok') else 1)" 2>/dev/null; then
    echo "  OK  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test @ $BASE_URL ==="

# 1. Public pages
for path in "/" "/admin/login" "/m/login" "/m"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  check "GET $path" "200" "$code"
done

# 2. Admin login
ADMIN_BODY=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$ADMIN_PHONE\",\"password\":\"$ADMIN_PASS\"}")
check_json_ok "POST /api/auth/admin/login" "$ADMIN_BODY"

# 3. Admin pages
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/dict" "/admin/organizations" "/admin/audit"; do
  code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  check "GET $path (admin)" "200" "$code"
done

# 4. User login
USER_BODY=$(curl -s -c "$USER_COOKIE" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$USER_PHONE\",\"password\":\"$USER_PASS\"}")
check_json_ok "POST /api/auth/login" "$USER_BODY"

# 5. User pages
for path in "/m/me" "/m/auction" "/m/drying" "/m/orders"; do
  code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  check "GET $path (user)" "200" "$code"
done

# 6. Third-party token (dev)
TP_BODY=$(curl -s "$BASE_URL/api/dev/third-party-token?u_id=smoke_test_user")
TOKEN=$(echo "$TP_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
  echo "  OK  GET /api/dev/third-party-token"
  PASS=$((PASS + 1))
else
  echo "  FAIL GET /api/dev/third-party-token: $TP_BODY"
  FAIL=$((FAIL + 1))
fi

# 7. Third-party auth
if [ -n "$TOKEN" ]; then
  TP_AUTH=$(curl -s -X POST "$BASE_URL/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  check_json_ok "POST /api/auth/third-party" "$TP_AUTH"
fi

# 8. Dict categories exist
DICT_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count()
  .then(n => { console.log(n); return p.\$disconnect(); })
  .catch(() => { console.log(0); return p.\$disconnect(); });
" 2>/dev/null | tail -1)
if [ "${DICT_COUNT:-0}" -gt 0 ]; then
  echo "  OK  dict categories seeded ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "  FAIL dict categories count is 0"
  FAIL=$((FAIL + 1))
fi

# 9. Live auction + dynamic bid
curl -s -o /dev/null -b "$USER_COOKIE" "$BASE_URL/m/auction"
AUCTION_INFO=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
p.auctionProject.findFirst({
  where: { status: 'LIVE' },
  select: { id: true, startPrice: true, bidStep: true },
}).then(async (project) => {
  if (!project) { console.log(''); return; }
  const top = await p.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: 'desc' },
  });
  const minNext = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(project.id + ' ' + minNext.toFixed(2));
}).finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

if [ -n "$AUCTION_INFO" ]; then
  PID=$(echo "$AUCTION_INFO" | awk '{print $1}')
  BID_AMOUNT=$(echo "$AUCTION_INFO" | awk '{print $2}')
  echo "  OK  live auction found ($PID)"
  PASS=$((PASS + 1))
  BID_BODY=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_AMOUNT}")
  check_json_ok "POST /api/m/auction/$PID/bid ($BID_AMOUNT)" "$BID_BODY"
else
  echo "  FAIL no LIVE auction for bid test"
  FAIL=$((FAIL + 1))
fi

# 10. Drying reserve
LISTING_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { if (r) console.log(r.id); p.\$disconnect(); })
  .catch(() => p.\$disconnect());
" 2>/dev/null | head -1)

if [ -n "$LISTING_ID" ]; then
  DRY_BODY=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-02\"}")
  # May fail if capacity full — accept ok or capacity error
  if echo "$DRY_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('ok') or '容量' in d.get('error','') or '已满' in d.get('error','') else 1)" 2>/dev/null; then
    echo "  OK  POST /api/m/drying/reserve"
    PASS=$((PASS + 1))
  else
    echo "  FAIL POST /api/m/drying/reserve: $DRY_BODY"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  FAIL no OPERATING drying listing"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
