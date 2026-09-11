#!/usr/bin/env bash
# API smoke tests for sishi-zichan (requires dev server at localhost:3000)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_error() {
  local name="$1" body="$2" keyword="$3"
  if echo "$body" | grep -q '"error"' && echo "$body" | grep -q "$keyword"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# Pages
for path in "/" "/admin/login" "/m" "/m/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# Admin login
body=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "admin login" "$body"

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying"; do
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path (admin)" "200" "$code"
done

# User login
USER_JAR=$(mktemp)
body=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "user login" "$body"

# Register (unique phone)
PHONE="199$(date +%s | tail -c 10)"
body=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_json_ok "register" "$body"

# Third-party token + SSO
body=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
TOKEN=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
  body=$(curl -s -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  assert_json_ok "third-party auth" "$body"
else
  echo "  ✗ third-party token"
  FAIL=$((FAIL + 1))
fi

# Non-multipart should return 400 not 500
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"file":"x"}')
assert_status "upload non-multipart" "400" "$code"

code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"x"}')
assert_status "assets non-multipart" "400" "$code"

# Auction bid (dynamic min amount)
PROJECT_ID=$(npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const p = new PrismaClient();
  p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
    .then(x => { console.log(x?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  MIN=$(npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    import { Decimal } from '@prisma/client/runtime/library';
    const p = new PrismaClient();
    async function run() {
      const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
      if (!project) { console.log(''); await p.\$disconnect(); return; }
      const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
      const min = top
        ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
        : new Decimal(project.startPrice.toString());
      console.log(min.toFixed(2));
      await p.\$disconnect();
    }
    run();
  " 2>/dev/null | tail -1)
  if [ -n "$MIN" ]; then
    body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
      -H "Content-Type: application/json" -d "{\"amount\":$MIN}")
    assert_json_ok "auction bid" "$body"
  else
    echo "  ✗ auction bid min amount"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ✗ no LIVE auction project found"
  FAIL=$((FAIL + 1))
fi

# Drying reservation (dynamic future dates)
LISTING_ID=$(npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const p = new PrismaClient();
  p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
    .then(x => { console.log(x?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_json_ok "drying reserve" "$body"

  # Past date should fail
  body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2020-01-01\",\"endDate\":\"2020-01-02\"}")
  assert_json_error "drying past date rejected" "$body" "不能早于今天"
else
  echo "  ✗ no drying listing found"
  FAIL=$((FAIL + 1))
fi

# Payment mock - duplicate rent should 409
if [ -n "$PROJECT_ID" ]; then
  body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_RENT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  if echo "$body" | grep -q '"ok":true\|"租金已支付"'; then
    echo "  ✓ auction rent payment"
    PASS=$((PASS + 1))
  else
    echo "  ✗ auction rent payment: $body"
    FAIL=$((FAIL + 1))
  fi
fi

rm -f "$USER_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
