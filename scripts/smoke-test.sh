#!/usr/bin/env bash
# End-to-end smoke tests — run from repo root: npm run test:smoke
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name expected=$expected got=$actual"
    FAIL=$((FAIL + 1))
  fi
}

# --- Static pages ---
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

# --- Favicon ---
check "GET /favicon.ico" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/favicon.ico")"
check "GET /favicon.svg" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/favicon.svg")"

# --- Admin login ---
ADMIN_RESP=$(curl -s -c /tmp/admin_cookies.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'fail')" 2>/dev/null || echo fail)
check "POST /api/auth/admin/login" ok "$ADMIN_CODE"

check "GET /admin (auth)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/admin_cookies.txt "$BASE/admin")"
check "GET /admin/dict (auth)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/admin_cookies.txt "$BASE/admin/dict")"

DICT_FILE=$(mktemp)
curl -s -b /tmp/admin_cookies.txt "$BASE/admin/dict" > "$DICT_FILE"
if grep -q "asset_type" "$DICT_FILE"; then
  echo "✓ dict contains asset_type"
  PASS=$((PASS + 1))
else
  echo "✗ dict missing asset_type"
  FAIL=$((FAIL + 1))
fi
rm -f "$DICT_FILE"

# --- User login ---
USER_RESP=$(curl -s -c /tmp/user_cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'fail')" 2>/dev/null || echo fail)
check "POST /api/auth/login" ok "$USER_CODE"

# --- Upload validation ---
check "POST /api/upload (no multipart)" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')"

# --- Dev third-party token ---
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-1")
TOKEN_CODE=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('token') else 'fail')" 2>/dev/null || echo fail)
check "GET /api/dev/third-party-token" ok "$TOKEN_CODE"

# --- Auth guard ---
check "GET /admin (no auth)" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

# --- Demo auction should be LIVE ---
AUCTION_FILE=$(mktemp)
curl -s "$BASE/m/auction" > "$AUCTION_FILE"
if grep -qE "竞拍中|进行中|status-live" "$AUCTION_FILE"; then
  echo "✓ demo auction is live"
  PASS=$((PASS + 1))
else
  echo "✗ demo auction not live"
  FAIL=$((FAIL + 1))
fi
rm -f "$AUCTION_FILE"

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
exit "$FAIL"
