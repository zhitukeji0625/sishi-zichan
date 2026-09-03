#!/usr/bin/env bash
# 功能冒烟测试 — 须从仓库根目录运行: npm run test:smoke
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_DIR=$(mktemp -d)
trap 'rm -rf "$COOKIE_DIR"' EXIT

check() {
  local name="$1" url="$2" expect="$3"
  local code
  code=$(curl -s -o /tmp/smoke_resp.txt -w "%{http_code}" "$url")
  if [ "$code" = "$expect" ]; then
    echo "PASS: $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name expected $expect got $code"
    head -c 300 /tmp/smoke_resp.txt
    echo
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test against $BASE ==="

check "首页" "$BASE/" "200"
check "管理登录页" "$BASE/admin/login" "200"
check "H5首页" "$BASE/m" "200"
check "H5登录" "$BASE/m/login" "200"
check "竞拍列表" "$BASE/m/auction" "200"
check "晒场" "$BASE/m/drying" "200"

# Admin login
ADMIN_RESP=$(curl -s -c "$COOKIE_DIR/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_RESP" | grep -q '"ok":true'; then
  echo "PASS: admin login API"
  PASS=$((PASS + 1))
else
  echo "FAIL: admin login API — $ADMIN_RESP"
  FAIL=$((FAIL + 1))
fi

ADMIN_CODE=$(curl -s -b "$COOKIE_DIR/admin.txt" -o /dev/null -w "%{http_code}" "$BASE/admin")
if [ "$ADMIN_CODE" = "200" ]; then
  echo "PASS: 管理后台(已登录) ($ADMIN_CODE)"
  PASS=$((PASS + 1))
else
  echo "FAIL: 管理后台 expected 200 got $ADMIN_CODE"
  FAIL=$((FAIL + 1))
fi

# User login
USER_RESP=$(curl -s -c "$COOKIE_DIR/user.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$USER_RESP" | grep -q '"ok":true'; then
  echo "PASS: user login API"
  PASS=$((PASS + 1))
else
  echo "FAIL: user login API — $USER_RESP"
  FAIL=$((FAIL + 1))
fi

check "用户中心" "$BASE/m/me" "200"

# Third party token
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=testuser")
if echo "$TOKEN_RESP" | grep -q '"token"'; then
  echo "PASS: third-party token"
  PASS=$((PASS + 1))
else
  echo "FAIL: third-party token — $TOKEN_RESP"
  FAIL=$((FAIL + 1))
fi

# Upload non-multipart returns 400 (even without auth)
UPLOAD_CODE=$(curl -s -o /tmp/upload_resp.txt -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
if [ "$UPLOAD_CODE" = "400" ]; then
  echo "PASS: upload non-multipart returns 400"
  PASS=$((PASS + 1))
else
  echo "FAIL: upload expected 400 got $UPLOAD_CODE"
  cat /tmp/upload_resp.txt
  FAIL=$((FAIL + 1))
fi

# Dict page
DICT_HTML=$(curl -s -b "$COOKIE_DIR/admin.txt" "$BASE/admin/dict")
if echo "$DICT_HTML" | grep -qiE '字典|dict|数据字典'; then
  echo "PASS: admin dict page has content"
  PASS=$((PASS + 1))
else
  echo "FAIL: admin dict page empty or missing"
  FAIL=$((FAIL + 1))
fi

# Dict categories in page or API check via HTML
DICT_COUNT=$(curl -s -b "$COOKIE_DIR/admin.txt" "$BASE/admin/dict" | grep -c 'builtIn\|asset_type\|资产类型' || true)
if [ "$DICT_COUNT" -ge 1 ]; then
  echo "PASS: dict data present"
  PASS=$((PASS + 1))
else
  echo "FAIL: dict data not found in admin page"
  FAIL=$((FAIL + 1))
fi

# Find LIVE auction and test bid
AUCTION_HTML=$(curl -s -b "$COOKIE_DIR/user.txt" "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE 'cm[a-z0-9]{20,}' | head -1)
if [ -n "$PROJECT_ID" ]; then
  echo "Found auction project: $PROJECT_ID"
  DETAIL=$(curl -s -b "$COOKIE_DIR/user.txt" "$BASE/m/auction/$PROJECT_ID")
  MIN_BID=$(echo "$DETAIL" | grep -oE '最低 ¥[^0-9]*[0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
  if [ -z "$MIN_BID" ]; then
    MIN_BID=$(echo "$DETAIL" | grep -oE 'minBid[^0-9]*[0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
  fi
  if [ -z "$MIN_BID" ]; then
    START=$(echo "$DETAIL" | grep -oE '起拍价[^¥]*¥[0-9.]+' | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
    STEP=$(echo "$DETAIL" | grep -oE '加价幅度[^¥]*¥[0-9.]+' | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
    CURRENT=$(echo "$DETAIL" | grep -oE '当前最高[^¥]*¥[0-9.]+' | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
    if [ -n "$CURRENT" ] && [ -n "$STEP" ]; then
      MIN_BID=$(python3 -c "print(float('$CURRENT') + float('$STEP'))" 2>/dev/null || echo "$CURRENT")
    elif [ -n "$START" ]; then
      MIN_BID="$START"
    fi
  fi
  BID_AMOUNT="${MIN_BID:-8200}"
  echo "Bid amount: $BID_AMOUNT"
  BID_RESP=$(curl -s -b "$COOKIE_DIR/user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_AMOUNT}")
  if echo "$BID_RESP" | grep -q '"ok":true'; then
    echo "PASS: bid API"
    PASS=$((PASS + 1))
  else
    echo "FAIL: bid API — $BID_RESP"
    FAIL=$((FAIL + 1))
  fi
else
  echo "FAIL: no auction project found in HTML"
  FAIL=$((FAIL + 1))
fi

# Drying listing page
check "晒场详情可访问" "$BASE/m/drying" "200"

# Favicon
FAV_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.svg")
if [ "$FAV_CODE" = "200" ] || [ "$FAV_CODE" = "204" ]; then
  echo "PASS: favicon ($FAV_CODE)"
  PASS=$((PASS + 1))
else
  echo "FAIL: favicon expected 200 got $FAV_CODE"
  FAIL=$((FAIL + 1))
fi

echo "=== RESULT: $PASS passed, $FAIL failed ==="
exit "$FAIL"
