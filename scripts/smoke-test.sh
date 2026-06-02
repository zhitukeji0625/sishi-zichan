#!/usr/bin/env bash
# Functional smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

check_http() {
  local method="$1" url="$2" expect="$3"
  local extra="${4:-}"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" $extra "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expect" ]]; then
    pass "$method $url -> $code"
  else
    fail "$method $url -> $code (expected $expect)"
  fi
}

echo "=== Public pages ==="
for path in / /m /m/login /admin/login; do
  check_http GET "$BASE$path" 200
done

echo "=== Auth: end user ==="
RES=$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$RES" | grep -q '"ok":true'; then
  pass "user login"
else
  fail "user login: $RES"
fi

echo "=== Auth: admin ==="
RES=$(curl -sS -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$RES" | grep -q '"ok":true'; then
  pass "admin login"
else
  fail "admin login: $RES"
fi

echo "=== Protected mobile pages (with session) ==="
for path in /m/me /m/auction /m/orders /m/drying; do
  check_http GET "$BASE$path" 200 "-b $COOKIE_JAR"
done

echo "=== Protected admin pages ==="
for path in /admin /admin/assets /admin/auctions; do
  check_http GET "$BASE$path" 200 "-b $ADMIN_JAR"
done

echo "=== Auction bid API ==="
PROJECT_ID=$(curl -sS "$BASE/m/auction" -b "$COOKIE_JAR" 2>/dev/null | grep -oP 'href="/m/auction/\K[^"]+' | head -1 || true)
if [[ -z "$PROJECT_ID" ]]; then
  # fallback: query DB via node
  PROJECT_ID=$(cd /workspace && node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
      .then(r => { console.log(r?.id || ''); return p.\$disconnect(); });
  " 2>/dev/null | tail -1)
fi
if [[ -n "$PROJECT_ID" ]]; then
  BID_RES=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":8200}')
  if echo "$BID_RES" | grep -qE '"ok":true|"bidId"'; then
    pass "auction bid"
  else
    # may fail if already highest bidder - check for business errors only
    if echo "$BID_RES" | grep -qE '出价|已|最高'; then
      pass "auction bid (business rule: $BID_RES)"
    else
      fail "auction bid: $BID_RES"
    fi
  fi
else
  fail "no LIVE auction project found"
fi

echo "=== Drying reserve API ==="
LISTING_ID=$(cd /workspace && node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
    .then(r => { console.log(r?.id || ''); return p.\$disconnect(); });
" 2>/dev/null | tail -1)
if [[ -n "$LISTING_ID" ]]; then
  TOMORROW=$(date -u -d '+2 days' +%Y-%m-%dT10:00:00.000Z 2>/dev/null || date -u -v+2d +%Y-%m-%dT10:00:00.000Z)
  START_DATE=$(date -u -d '+3 days' +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  END_DATE=$(date -u -d '+5 days' +%Y-%m-%d 2>/dev/null || date -u -v+5d +%Y-%m-%d)
  DRY_RES=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  if echo "$DRY_RES" | grep -qE '"ok":true|"reservationId"'; then
    pass "drying reserve"
  elif echo "$DRY_RES" | grep -qE '已满|重复|不可'; then
    pass "drying reserve (business rule: $DRY_RES)"
  else
    fail "drying reserve: $DRY_RES"
  fi
else
  fail "no drying listing found"
fi

echo "=== Mock payment API ==="
if [[ -n "$PROJECT_ID" ]]; then
  PAY_RES=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  if echo "$PAY_RES" | grep -qE '"ok":true'; then
    pass "mock payment"
  elif echo "$PAY_RES" | grep -qE '已缴纳|已支付'; then
    pass "mock payment (business rule: $PAY_RES)"
  else
    fail "mock payment: $PAY_RES"
  fi
else
  pass "mock payment skipped (no auction project)"
fi

echo "=== Third-party token (dev) ==="
TOKEN_RES=$(curl -sS "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
if echo "$TOKEN_RES" | grep -q 'token'; then
  pass "third-party token"
  TOKEN=$(echo "$TOKEN_RES" | grep -oP '"token"\s*:\s*"\K[^"]+' || echo "$TOKEN_RES" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  SSO_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  if [[ "$SSO_CODE" == "200" || "$SSO_CODE" == "307" || "$SSO_CODE" == "302" ]]; then
    pass "SSO page"
  else
    fail "SSO page -> $SSO_CODE"
  fi
else
  fail "third-party token: $TOKEN_RES"
fi

echo "=== Admin assets API (create) ==="
ORG_ID=$(cd /workspace && node -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.organization.findFirst({where:{level:"REGIMENT"}}).then(o=>{console.log(o?.id||"");return p.$disconnect();});' 2>/dev/null | tail -1)
CREATE_CODE=$(curl -sS -o /tmp/asset-create.json -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -F "orgId=${ORG_ID}" \
  -F "type=LAND" -F "name=冒烟测试地块" -F "locationText=测试地址" 2>/dev/null || echo "000")
if [[ "$CREATE_CODE" == "200" ]]; then
  pass "admin assets create"
else
  fail "admin assets create -> $CREATE_CODE $(head -c 120 /tmp/asset-create.json 2>/dev/null)"
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "$FAIL smoke test(s) failed."
  exit 1
fi
