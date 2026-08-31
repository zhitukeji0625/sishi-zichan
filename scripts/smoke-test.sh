#!/usr/bin/env bash
# End-to-end smoke tests for sishi-zichan (run with dev server on :3000)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}"

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL + 1)); }

expect_code() {
  local name="$1" url="$2" expect="$3"
  local extra="${4:-}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $extra "$url")
  if [ "$code" = "$expect" ]; then pass "$name ($code)"; else fail "$name (got $code, want $expect)"; fi
}

json_ok() {
  local name="$1" resp="$2"
  if echo "$resp" | python3 -c "import sys,json; sys.exit(0 if json.load(sys.stdin).get('ok') else 1)" 2>/dev/null; then
    pass "$name"
  else
    fail "$name: $resp"
  fi
}

echo "=== Smoke test @ $BASE ==="

expect_code "GET /" "$BASE/" 200
expect_code "GET /m" "$BASE/m" 200
expect_code "GET /admin/login" "$BASE/admin/login" 200

USER_RESP=$(curl -s -c "$TMPDIR/smoke_user.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
json_ok "User login" "$USER_RESP"

ADMIN_RESP=$(curl -s -c "$TMPDIR/smoke_admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
json_ok "Admin login" "$ADMIN_RESP"

TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test")
if echo "$TOKEN_RESP" | python3 -c "import sys,json; sys.exit(0 if json.load(sys.stdin).get('token') else 1)" 2>/dev/null; then
  pass "Dev third-party token"
else
  fail "Dev third-party token: $TOKEN_RESP"
fi

expect_code "GET /admin (auth)" "$BASE/admin" 200 "-b $TMPDIR/smoke_admin.txt"
expect_code "GET /m/auction" "$BASE/m/auction" 200 "-b $TMPDIR/smoke_user.txt"
expect_code "GET /m/drying" "$BASE/m/drying" 200 "-b $TMPDIR/smoke_user.txt"
expect_code "GET /m/me" "$BASE/m/me" 200 "-b $TMPDIR/smoke_user.txt"
expect_code "GET /m/orders" "$BASE/m/orders" 200 "-b $TMPDIR/smoke_user.txt"
expect_code "GET /admin/assets" "$BASE/admin/assets" 200 "-b $TMPDIR/smoke_admin.txt"
expect_code "GET /admin/auctions" "$BASE/admin/auctions" 200 "-b $TMPDIR/smoke_admin.txt"
expect_code "GET /admin/dict" "$BASE/admin/dict" 200 "-b $TMPDIR/smoke_admin.txt"

# Trigger layout cron (demo auction refresh + status sync)
curl -s -o /dev/null "$BASE/"

PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot -N -e \
  "SELECT id FROM sishi.AuctionProject WHERE status='LIVE' LIMIT 1;" 2>/dev/null || true)

if [ -n "$PROJECT_ID" ]; then
  pass "LIVE auction exists ($PROJECT_ID)"
  expect_code "GET auction detail" "$BASE/m/auction/$PROJECT_ID" 200 "-b $TMPDIR/smoke_user.txt"

  PAGE=$(curl -s -b "$TMPDIR/smoke_user.txt" "$BASE/m/auction/$PROJECT_ID")
  MIN_BID=$(echo "$PAGE" | python3 -c "
import re, sys
html = sys.stdin.read()
m = re.search(r'最低[^¥]*¥([0-9]+(?:\.[0-9]+)?)', html)
if m:
    print(m.group(1))
else:
    m2 = re.search(r'当前最高出价[^¥]*¥([0-9]+(?:\.[0-9]+)?)', html)
    if m2:
        print(float(m2.group(1)) + 200)
    else:
        print(8200)
" 2>/dev/null || echo "8200")

  BID_RESP=$(curl -s -b "$TMPDIR/smoke_user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\": $MIN_BID}")
  json_ok "Place bid (¥$MIN_BID)" "$BID_RESP"
else
  fail "No LIVE auction project"
fi

# Dict seeded
DICT_CNT=$(sudo docker exec mariadb mariadb -uroot -proot -N -e "SELECT COUNT(*) FROM sishi.DictCategory;" 2>/dev/null || echo "0")
if [ "${DICT_CNT:-0}" -gt 0 ]; then
  pass "Dict categories seeded ($DICT_CNT)"
else
  fail "Dict categories empty (run npm run db:seed)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
