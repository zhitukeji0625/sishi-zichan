#!/bin/bash
# Functional smoke test for sishi-zichan APIs and pages
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_COOKIE=$(mktemp)
USER_COOKIE=$(mktemp)

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

check_contains() {
  local name="$1" needle="$2" body="$3"
  if echo "$body" | grep -q "$needle"; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name (missing: $needle)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Page smoke tests ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login" "/admin"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  # /admin without login should redirect (307/302) or show login
  if [ "$path" = "/admin" ]; then
    if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "200" ]; then
      echo "✓ GET $path ($code)"
      PASS=$((PASS+1))
    else
      echo "✗ GET $path (got $code)"
      FAIL=$((FAIL+1))
    fi
  else
    check "GET $path" "200" "$code"
  fi
done

echo ""
echo "=== Admin login ==="
ADMIN_RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
ADMIN_BODY=$(echo "$ADMIN_RESP" | sed '$d')
check "POST /api/auth/admin/login" "200" "$ADMIN_CODE"
check_contains "admin login response" '"ok":true' "$ADMIN_BODY"

echo ""
echo "=== Admin protected page ==="
ADMIN_PAGE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/assets")
check "GET /admin/assets (authenticated)" "200" "$ADMIN_PAGE"

echo ""
echo "=== Admin assets GET should be 405 ==="
ASSETS_GET=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/api/admin/assets")
check "GET /api/admin/assets" "405" "$ASSETS_GET"

echo ""
echo "=== Admin assets POST without multipart should be 400 ==="
ASSETS_BAD=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/admin/assets (non-multipart)" "400" "$ASSETS_BAD"

echo ""
echo "=== User login ==="
USER_RESP=$(curl -s -w "\n%{http_code}" -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | tail -1)
USER_BODY=$(echo "$USER_RESP" | sed '$d')
check "POST /api/auth/login" "200" "$USER_CODE"
check_contains "user login response" '"ok":true' "$USER_BODY"

echo ""
echo "=== Upload without multipart should be 400 ==="
UPLOAD_BAD=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/upload (non-multipart, admin)" "400" "$UPLOAD_BAD"

echo ""
echo "=== Upload without login should be 401 ==="
UPLOAD_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check "POST /api/upload (no auth)" "401" "$UPLOAD_NOAUTH"

echo ""
echo "=== Third-party token (dev) ==="
TP_RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user-001")
TP_CODE=$(echo "$TP_RESP" | tail -1)
TP_BODY=$(echo "$TP_RESP" | sed '$d')
check "GET /api/dev/third-party-token" "200" "$TP_CODE"
TOKEN=$(echo "$TP_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)
if [ -n "$TOKEN" ]; then
  echo "✓ token generated"
  PASS=$((PASS+1))
else
  echo "✗ token not in response"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Third-party SSO login ==="
if [ -n "${TOKEN:-}" ]; then
  SSO_RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  SSO_CODE=$(echo "$SSO_RESP" | tail -1)
  SSO_BODY=$(echo "$SSO_RESP" | sed '$d')
  check "POST /api/auth/third-party" "200" "$SSO_CODE"
  check_contains "third-party login" '"ok":true' "$SSO_BODY"
fi

echo ""
echo "=== Auction bid (need live project) ==="
PROJECT_ID=$(cd /workspace && npx tsx -e "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } }).then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); });" 2>/dev/null | tail -1)
if [ -n "${PROJECT_ID:-}" ]; then
  echo "Found project: $PROJECT_ID"
  BID_RESP=$(curl -s -w "\n%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":"110"}')
  BID_CODE=$(echo "$BID_RESP" | tail -1)
  BID_BODY=$(echo "$BID_RESP" | sed '$d')
  # 200 = success, 400 = business rule (already bid higher etc) - both mean API works
  if [ "$BID_CODE" = "200" ] || [ "$BID_CODE" = "400" ]; then
    echo "✓ POST /api/m/auction/$PROJECT_ID/bid ($BID_CODE)"
    PASS=$((PASS+1))
  else
    echo "✗ POST /api/m/auction/$PROJECT_ID/bid (got $BID_CODE: $BID_BODY)"
    FAIL=$((FAIL+1))
  fi
else
  echo "⚠ No live auction project found on /m/auction (skipping bid test)"
fi

echo ""
echo "=== Drying reservation validation ==="
DRY_BAD=$(curl -s -w "\n%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{}')
DRY_CODE=$(echo "$DRY_BAD" | tail -1)
# Should be 400 for missing params
if [ "$DRY_CODE" = "400" ] || [ "$DRY_CODE" = "422" ]; then
  echo "✓ POST /api/m/drying/reserve validation ($DRY_CODE)"
  PASS=$((PASS+1))
else
  echo "✗ POST /api/m/drying/reserve validation (got $DRY_CODE)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Mock payment without body should fail ==="
PAY_BAD=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{}')
if [ "$PAY_BAD" = "400" ] || [ "$PAY_BAD" = "401" ] || [ "$PAY_BAD" = "404" ]; then
  echo "✓ POST /api/m/payments/mock validation ($PAY_BAD)"
  PASS=$((PASS+1))
else
  echo "✗ POST /api/m/payments/mock (got $PAY_BAD)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Register duplicate phone should fail ==="
REG_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123","name":"重复"}')
REG_CODE=$(echo "$REG_RESP" | tail -1)
if [ "$REG_CODE" = "400" ] || [ "$REG_CODE" = "409" ]; then
  echo "✓ POST /api/auth/register duplicate ($REG_CODE)"
  PASS=$((PASS+1))
else
  echo "✗ POST /api/auth/register duplicate (got $REG_CODE)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS, Failed: $FAIL"
rm -f "$COOKIE_JAR" "$ADMIN_COOKIE" "$USER_COOKIE"
[ "$FAIL" -eq 0 ]
