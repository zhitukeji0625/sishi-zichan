#!/usr/bin/env bash
# 本地/CI 冒烟：需已启动 MariaDB、db push/seed，且 dev 或 start 在 BASE 可访问
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
COOKIE_USER="${TMPDIR:-/tmp}/sishi_smoke_user.txt"
COOKIE_ADMIN="${TMPDIR:-/tmp}/sishi_smoke_admin.txt"
rm -f "$COOKIE_USER" "$COOKIE_ADMIN"

fail=0
check_http() {
  local name="$1" expect="$2" url="$3"
  shift 3
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' "$@" "$url")
  if [ "$got" != "$expect" ]; then
    echo "FAIL $name: expected $expect, got $got ($url)"
    fail=$((fail + 1))
  else
    echo "OK   $name"
  fi
}

check_http "GET /" 200 "$BASE/"
check_http "GET /m" 200 "$BASE/m"
check_http "GET /admin/login" 200 "$BASE/admin/login"

curl -sf -c "$COOKIE_USER" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' >/dev/null
check_http "POST user login" 200 "$BASE/m/me" -b "$COOKIE_USER"

curl -sf -c "$COOKIE_ADMIN" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' >/dev/null
check_http "GET /admin" 200 "$BASE/admin" -b "$COOKIE_ADMIN" -L

for path in /admin/assets /admin/auctions /admin/dict; do
  check_http "GET $path" 200 "$BASE$path" -b "$COOKIE_ADMIN" -L
done
for path in /m/auction /m/drying; do
  check_http "GET $path" 200 "$BASE$path"
done

BAD=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
if [ "$BAD" != "401" ]; then
  echo "FAIL bad password: expected 401, got $BAD"
  fail=$((fail + 1))
else
  echo "OK   bad password rejected"
fi

if [ "$fail" -eq 0 ]; then
  echo "Smoke tests passed ($BASE)"
else
  echo "$fail smoke check(s) failed"
  exit 1
fi
