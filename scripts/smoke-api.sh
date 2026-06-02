#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/sishi-smoke-cookies.txt"
ADMIN_JAR="/tmp/sishi-smoke-admin-cookies.txt"
FAIL=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [[ "$actual" != "$expect" ]]; then
    echo "FAIL: $name (expected HTTP $expect, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name ($actual)"
  fi
}

json_field() {
  node -e "const j=JSON.parse(process.argv[1]); console.log(j[process.argv[2]]??'')" "$1" "$2" 2>/dev/null || echo ""
}

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

# Public pages
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# User login
RESP=$(curl -s -w '\n%{http_code}' -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -n 1)
check "POST /api/auth/login (demo user)" 200 "$CODE"
OK=$(json_field "$BODY" ok)
[[ "$OK" == "true" ]] || { echo "FAIL: login body ok=$OK"; FAIL=$((FAIL+1)); }

# Bid without auth
check "POST bid unauthenticated" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"

# Admin login
RESP=$(curl -s -w '\n%{http_code}' -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -n 1)
check "POST /api/auth/admin/login" 200 "$CODE"

# Admin protected page
check "GET /admin (with cookie)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")"

# Third-party dev token (dev only)
DEV_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?phone=13800138000")
check "GET /api/dev/third-party-token" 200 "$DEV_CODE"

# Drying reserve (needs listing id from env)
if [[ -n "${LISTING_ID:-}" ]]; then
  RESP=$(curl -s -w '\n%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-06-10\",\"endDate\":\"2026-06-12\"}")
  CODE=$(echo "$RESP" | tail -n 1)
  check "POST /api/m/drying/reserve" 200 "$CODE"
fi

# Auction bid (needs project id)
if [[ -n "${PROJECT_ID:-}" ]]; then
  RESP=$(curl -s -w '\n%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d '{"amount":8000}')
  CODE=$(echo "$RESP" | tail -n 1)
  BODY=$(echo "$RESP" | head -n -1)
  check "POST /api/m/auction/bid" 200 "$CODE"
  echo "  bid response: $BODY"
fi

echo "---"
if [[ $FAIL -eq 0 ]]; then
  echo "All smoke checks passed."
  exit 0
else
  echo "$FAIL check(s) failed."
  exit 1
fi
