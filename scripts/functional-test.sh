#!/usr/bin/env bash
# Functional smoke tests — requires dev server at http://localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/sishi-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
SSO_JAR="/tmp/sishi-sso-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR" "$SSO_JAR"

pass() { echo "✓ $1"; PASS=$((PASS+1)); }
fail() { echo "✗ $1: $2"; FAIL=$((FAIL+1)); }

# Public pages
for path in "/" "/m" "/admin/login" "/m/login" "/m/register" "/m/auction" "/m/drying"; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE$path" || echo "000")
  if [ "$code" = "200" ]; then pass "GET $path -> $code"; else fail "GET $path" "expected 200, got $code"; fi
done

# User login
resp=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$resp" | grep -qE '"ok"|"success"|"user"'; then pass "User login"; else fail "User login" "$resp"; fi

# User auction page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/auction")
if [ "$code" = "200" ]; then pass "User auction page -> $code"; else fail "User auction page" "got $code"; fi

# Admin login
resp=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$resp" | grep -qE '"ok"|"success"|"admin"'; then pass "Admin login"; else fail "Admin login" "$resp"; fi

# Admin pages
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/registrations" "/admin/drying" \
  "/admin/announcements" "/admin/organizations" "/admin/admins" "/admin/config" "/admin/dict" "/admin/audit"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  if [ "$code" = "200" ]; then pass "Admin GET $path -> $code"; else fail "Admin GET $path" "got $code"; fi
done

# Dev third-party token
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001")
if echo "$resp" | grep -q '"token"'; then pass "Dev third-party token"; else fail "Dev third-party token" "$resp"; fi

# Third-party SSO login
TOKEN=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
  resp=$(curl -s -c "$SSO_JAR" -b "$SSO_JAR" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  if echo "$resp" | grep -qE '"ok"|"success"|"user"'; then pass "Third-party SSO login"; else fail "Third-party SSO login" "$resp"; fi
else
  fail "Third-party SSO login" "no token"
fi

# Find live auction project id (cuid format)
auction_html=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction")
project_id=$(echo "$auction_html" | grep -oE '/m/auction/cm[a-z0-9]+' | head -1 | sed 's|.*/||')
if [ -n "$project_id" ]; then
  pass "Found auction project: $project_id"
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/auction/$project_id")
  if [ "$code" = "200" ]; then pass "Auction detail page -> $code"; else fail "Auction detail page" "got $code"; fi
else
  fail "Find auction project" "no project id in page"
fi

# Place bid (use a high amount to exceed current highest + step)
if [ -n "$project_id" ]; then
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":99999}')
  if echo "$resp" | grep -qE '"ok"|"success"|"bidId"'; then pass "Place bid"; else fail "Place bid" "$resp"; fi
fi

# Drying, me, orders
for path in "/m/drying" "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path -> $code"; else fail "GET $path" "got $code"; fi
done

# Unauthenticated bid should fail
if [ -n "$project_id" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":8200}')
  if [ "$code" = "401" ] || [ "$code" = "403" ]; then pass "Unauth bid rejected -> $code"; else fail "Unauth bid" "expected 401/403, got $code"; fi
fi

# Unauth admin redirect
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "303" ]; then pass "Unauth admin redirect -> $code"; else fail "Unauth admin" "got $code"; fi

# Logout
resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
if echo "$resp" | grep -qE '"ok"|"success"'; then pass "User logout"; else fail "User logout" "$resp"; fi
resp=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
if echo "$resp" | grep -qE '"ok"|"success"'; then pass "Admin logout"; else fail "Admin logout" "$resp"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
