#!/usr/bin/env bash
# Quick API smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:3000}"
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=1
  else
    echo "OK: $name"
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (body missing pattern: $pattern)"
    echo "  body: ${body:0:200}"
    FAIL=1
  fi
}

check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

TP_BODY=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
check_json "third-party-token" '"token"' "$TP_BODY"
TP_TOKEN=$(echo "$TP_BODY" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

LOGIN_BODY=$(curl -s -c /tmp/smoke-user-cookies.txt -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
check_json "user login" '"ok":true' "$LOGIN_BODY"

ADMIN_BODY=$(curl -s -c /tmp/smoke-admin-cookies.txt -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json "admin login" '"ok":true' "$ADMIN_BODY"

check "GET /admin/assets (with cookie)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke-admin-cookies.txt "$BASE/admin/assets")"

SSO_BODY=$(curl -s -c /tmp/smoke-sso-cookies.txt -X POST "$BASE/api/auth/third-party" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TP_TOKEN\"}")
check_json "third-party auth" '"ok":true' "$SSO_BODY"

AUCTION_PAGE=$(curl -s "$BASE/m/auction")
if echo "$AUCTION_PAGE" | grep -qi 'auction\|竞拍'; then
  echo "OK: auction list page renders"
else
  echo "WARN: auction page may be empty"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "All smoke checks passed."
  exit 0
else
  echo "Some smoke checks failed."
  exit 1
fi
