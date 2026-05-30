#!/usr/bin/env bash
# Integration smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1"; FAIL=1; }

echo "=== Integration tests @ $BASE ==="

# Public pages
for path in "/" "/m" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [[ "$code" == "200" ]]; then pass "GET $path -> $code"; else fail "GET $path -> $code"; fi
done

# User login
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN" | grep -qE '"ok"|"success"|"userId"|"id"'; then
  pass "POST /api/auth/login (tenant)"
else
  fail "POST /api/auth/login: $LOGIN"
fi

# Admin login
ALOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ALOGIN" | grep -qE '"ok"|"success"|"adminId"|"id"'; then
  pass "POST /api/auth/admin/login"
else
  fail "POST /api/auth/admin/login: $ALOGIN"
fi

# Protected admin page (should redirect or 200 with cookie)
ACODE=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
if [[ "$ACODE" == "200" || "$ACODE" == "307" || "$ACODE" == "308" ]]; then
  pass "GET /admin with session -> $ACODE"
else
  fail "GET /admin with session -> $ACODE"
fi

# Mobile pages with user cookie
for path in "/m/me" "/m/auction" "/m/orders" "/m/drying"; do
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  if [[ "$code" == "200" ]]; then pass "GET $path (auth) -> $code"; else fail "GET $path (auth) -> $code"; fi
done

# Dev third-party token
TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-integration")
if echo "$TP" | grep -qE 'token'; then
  pass "GET /api/dev/third-party-token"
  TOKEN=$(echo "$TP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  if [[ -n "$TOKEN" ]]; then
    SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
    if [[ "$SSO_CODE" == "200" || "$SSO_CODE" == "307" || "$SSO_CODE" == "308" ]]; then
      pass "GET /m/sso?token=... -> $SSO_CODE"
    else
      fail "GET /m/sso -> $SSO_CODE"
    fi
  fi
else
  fail "third-party token: $TP"
fi

# Admin assets API (POST-only; unauthenticated must 401)
UNAUTH_ASSET=$(curl -s -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')
if echo "$UNAUTH_ASSET" | grep -q "未登录"; then
  pass "POST /api/admin/assets requires auth"
else
  fail "POST /api/admin/assets unauth: $UNAUTH_ASSET"
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

if [[ "$FAIL" -eq 0 ]]; then
  echo "=== All integration checks passed ==="
  exit 0
else
  echo "=== Some checks failed ==="
  exit 1
fi
