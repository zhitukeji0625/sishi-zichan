#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
USER_COOKIE=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$USER_COOKIE"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name expected=$expected got=$actual"
    FAIL=$((FAIL + 1))
  fi
}

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")
check "GET /" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")
check "GET /admin/login" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")
check "GET /m" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")
check "GET /m/login" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -L "$BASE/favicon.ico")
check "GET /favicon.ico" "200" "$code"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$COOKIE_JAR")
code=$(echo "$resp" | tail -1)
check "POST /api/auth/admin/login" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin" -b "$COOKIE_JAR")
check "GET /admin (authenticated)" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/dict" -b "$COOKIE_JAR")
check "GET /admin/dict" "200" "$code"

dict_count=$(npx tsx -e 'import {PrismaClient} from "@prisma/client"; const p=new PrismaClient(); p.dictCategory.count().then(c=>{console.log(c);p.$disconnect()})' 2>/dev/null)
check "Dict categories count" "14" "$dict_count"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$USER_COOKIE")
code=$(echo "$resp" | tail -1)
check "POST /api/auth/login" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction" -b "$USER_COOKIE")
check "GET /m/auction" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/me" -b "$USER_COOKIE")
check "GET /m/me" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123")
check "GET /api/dev/third-party-token" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" \
  -d '{}' -b "$COOKIE_JAR")
check "POST /api/upload (non-multipart)" "400" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{}' -b "$COOKIE_JAR")
check "POST /api/admin/assets (non-multipart)" "400" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")
check "GET /admin (unauthenticated)" "307" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")
check "GET /m/drying" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/auctions" -b "$COOKIE_JAR")
check "GET /admin/auctions" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/assets" -b "$COOKIE_JAR")
check "GET /admin/assets" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/logout" -b "$USER_COOKIE")
check "POST /api/auth/logout" "200" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
