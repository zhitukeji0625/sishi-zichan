#!/usr/bin/env bash
# Functional smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail=0
check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    fail=$((fail + 1))
  else
    echo "OK: $name"
  fi
}

# Public pages
for path in / /m /m/login /m/register /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# Admin login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$ADMIN_JAR")
check "POST /api/auth/admin/login" "200" "$code"

# Admin protected route without cookie
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
check "GET /admin (no cookie redirect)" "307" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin" -b "$ADMIN_JAR")
check "GET /admin (with cookie)" "200" "$code"

# End user login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$COOKIE_JAR")
check "POST /api/auth/login" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/me" -b "$COOKIE_JAR")
check "GET /m/me (authenticated)" "200" "$code"

# Mobile pages
for path in /m/auction /m/drying /m/orders; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# Invalid login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check "POST /api/auth/login (bad password)" "401" "$code"

if [[ $fail -gt 0 ]]; then
  echo "Smoke tests failed: $fail error(s)"
  exit 1
fi
echo "All smoke tests passed."
