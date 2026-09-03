#!/usr/bin/env bash
# 功能冒烟测试：须从仓库根目录运行（npm run test:smoke）
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$USER_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name ($body)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test against $BASE ==="

check "GET /" "200" "$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/")"
check "GET /m" "200" "$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/m")"
check "GET /m/login" "200" "$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/m/login")"
check "GET /m/auction" "200" "$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/m/auction")"
check "GET /m/drying" "200" "$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/m/drying")"
check "GET /admin/login" "200" "$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/admin/login")"
check "GET /favicon.svg" "200" "$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/favicon.svg")"

ADMIN_RESP=$(curl -sf -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "POST /api/auth/admin/login" "$ADMIN_RESP"

check "GET /admin (auth)" "200" "$(curl -sf -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")"
check "GET /admin/dict" "200" "$(curl -sf -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin/dict")"
check "GET /admin/assets" "200" "$(curl -sf -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin/assets")"
check "GET /admin/auctions" "200" "$(curl -sf -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin/auctions")"

DICT_HTML=$(curl -sf -b "$COOKIE_JAR" "$BASE/admin/dict")
DICT_MATCH=$(echo "$DICT_HTML" | grep -c 'asset_type' || true)
if [ "${DICT_MATCH:-0}" -gt 0 ]; then
  echo "✓ Admin dict has seed data"
  PASS=$((PASS + 1))
else
  echo "✗ Admin dict missing seed data"
  FAIL=$((FAIL + 1))
fi

USER_RESP=$(curl -sf -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "POST /api/auth/login" "$USER_RESP"

AUCTION_HTML=$(curl -sf "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE 'cm[a-z0-9]{20,}' | head -1)
if [ -n "$PROJECT_ID" ]; then
  echo "✓ Found auction project ($PROJECT_ID)"
  PASS=$((PASS + 1))
else
  echo "✗ No auction project ID found"
  FAIL=$((FAIL + 1))
fi

if [ -n "$PROJECT_ID" ]; then
  check "GET /m/auction/$PROJECT_ID" "200" "$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")"

  DETAIL=$(curl -sf "$BASE/m/auction/$PROJECT_ID")
  PRICES=($(echo "$DETAIL" | grep -oE '¥[^0-9]*[0-9]+' | grep -oE '[0-9]+' || true))
  CURRENT=${PRICES[0]:-8000}
  START=${PRICES[1]:-$CURRENT}
  STEP=${PRICES[2]:-200}
  if [ "$CURRENT" = "$START" ]; then
    TRY_AMOUNTS=("$CURRENT" "$((CURRENT + STEP))")
  else
    TRY_AMOUNTS=("$((CURRENT + STEP))")
  fi
  BID_OK=false
  for amount in "${TRY_AMOUNTS[@]}"; do
    BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
      -H "Content-Type: application/json" \
      -d "{\"amount\":$amount}")
    if echo "$BID_RESP" | grep -q '"ok":true'; then
      echo "✓ POST bid at amount ($amount)"
      PASS=$((PASS + 1))
      BID_OK=true
      break
    fi
  done
  if [ "$BID_OK" = false ]; then
    echo "✗ POST bid failed: $BID_RESP"
    FAIL=$((FAIL + 1))
  fi
fi

check "POST /api/upload (non-multipart)" "400" "$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')"

TP_RESP=$(curl -sf "$BASE/api/dev/third-party-token?u_id=smoke_test")
if echo "$TP_RESP" | grep -q '"token"'; then
  echo "✓ GET /api/dev/third-party-token"
  PASS=$((PASS + 1))
else
  echo "✗ GET /api/dev/third-party-token ($TP_RESP)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
