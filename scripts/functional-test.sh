#!/bin/bash
# Functional API smoke tests
set -e
BASE="http://localhost:3000"
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name"
  fi
}

echo "=== User auth ==="
# Register with unique phone
PHONE="139$(date +%s | tail -c 9)"
REG=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"测试用户\"}")
REG_CODE=$(echo "$REG" | tail -1)
REG_BODY=$(echo "$REG" | sed '$d')
check "register" "200" "$REG_CODE"

# Login user
LOGIN=$(curl -s -c /tmp/user-cookies.txt -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"13800138000\",\"password\":\"user123\"}")
LOGIN_CODE=$(echo "$LOGIN" | tail -1)
check "user login (demo)" "200" "$LOGIN_CODE"

echo "=== Admin auth ==="
ADMIN_LOGIN=$(curl -s -c /tmp/admin-cookies.txt -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_LOGIN" | tail -1)
check "admin login (division)" "200" "$ADMIN_CODE"

echo "=== Admin assets API (POST only) ==="
# GET returns 405 by design; assets are listed via server components
ASSETS_GET=$(curl -s -b /tmp/admin-cookies.txt -o /dev/null -w "%{http_code}" "$BASE/api/admin/assets")
check "admin assets GET returns 405" "405" "$ASSETS_GET"

echo "=== Data dictionary ==="
DICT_COUNT=$(cd /workspace && npx tsx -e "const {PrismaClient}=require('@prisma/client');new PrismaClient().dictCategory.count().then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
if [ "${DICT_COUNT:-0}" -lt 1 ]; then
  echo "FAIL: dict categories missing (run npm run db:seed)"
  FAIL=$((FAIL + 1))
else
  echo "OK: dict categories ($DICT_COUNT)"
fi

echo "=== Third-party token (dev) ==="
TP=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user-001")
TP_CODE=$(echo "$TP" | tail -1)
check "dev third-party token" "200" "$TP_CODE"

echo "=== Pages ==="
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "page $path" "200" "$CODE"
done

echo "=== Summary ==="
if [ "$FAIL" -gt 0 ]; then
  echo "$FAIL test(s) failed"
  exit 1
fi
echo "All functional tests passed"
