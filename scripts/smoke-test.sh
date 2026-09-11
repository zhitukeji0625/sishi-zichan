#!/usr/bin/env bash
# API 冒烟测试 — 须在 dev 模式 (npm run dev) 下运行
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ERRORS=""

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expect, got $actual)"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n- $name: expected $expect, got $actual"
  fi
}

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" 2>/dev/null || echo "000")
if [ "$code" != "200" ]; then
  echo "ERROR: dev server not reachable at $BASE (got $code). Run: npm run dev"
  exit 1
fi

npm run db:seed --silent 2>/dev/null || true

PROJECT_JSON=$(npx tsx scripts/db-query.ts live-project 2>/dev/null || echo "")
LISTING_ID=$(npx tsx scripts/db-query.ts drying-listing 2>/dev/null || echo "")

if [ -z "$PROJECT_JSON" ]; then
  echo "WARN: no LIVE auction project; bid test skipped"
fi

check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "GET /m/auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "GET /m/drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

check "POST /api/auth/login empty" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{}')"
check "POST /api/auth/admin/login empty" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{}')"
check "POST /api/auth/login wrong" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"wrong"}')"
check "POST /api/auth/admin/login wrong" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"wrong"}')"

USER_COOKIE=$(mktemp)
check "POST /api/auth/login ok" "200" "$(curl -s -o /dev/null -w '%{http_code}' -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')"

ADMIN_COOKIE=$(mktemp)
check "POST /api/auth/admin/login ok" "200" "$(curl -s -o /dev/null -w '%{http_code}' -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')"

PHONE="199$(date +%s | tail -c 9)"
check "POST /api/auth/register" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"test123\",\"name\":\"冒烟测试\"}")"

check "POST bid no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"

if [ -n "$PROJECT_JSON" ]; then
  PROJECT_ID=$(echo "$PROJECT_JSON" | npx tsx -e "const p=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(p.id)")
  BID_AMOUNT=$(echo "$PROJECT_JSON" | npx tsx -e "const p=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(p.minBid)")
  check "POST bid LIVE project" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' -d "{\"amount\":$BID_AMOUNT}")"
fi

check "POST /api/upload no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")"
check "POST /api/upload non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"
check "POST /api/admin/assets non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')"

if [ -n "$LISTING_ID" ]; then
  START=$(date -d '+3 days' +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d '+4 days' +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  check "POST drying reserve" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")"
fi

check "GET third-party-token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123")"
check "GET /m/me" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" "$BASE/m/me")"
check "GET /admin" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -L "$BASE/admin")"

echo ""
echo "PASS: $PASS  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo -e "Failures:$ERRORS"
  exit 1
fi
