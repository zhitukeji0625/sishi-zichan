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
LOGIN=$(curl -s -c /tmp/user-cookies.txt -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
LOGIN_CODE=$(echo "$LOGIN" | tail -1)
check "user login (demo)" "200" "$LOGIN_CODE"

echo "=== Admin auth ==="
ADMIN_LOGIN=$(curl -s -c /tmp/admin-cookies.txt -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_LOGIN" | tail -1)
check "admin login (division)" "200" "$ADMIN_CODE"

echo "=== Admin assets API ==="
ASSETS_GET=$(curl -s -b /tmp/admin-cookies.txt -o /dev/null -w "%{http_code}" "$BASE/api/admin/assets")
check "admin assets GET returns 405" "405" "$ASSETS_GET"

ASSETS_JSON=$(curl -s -b /tmp/admin-cookies.txt -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"test","type":"LAND","name":"test","locationText":"test"}')
check "admin assets JSON POST returns 400" "400" "$ASSETS_JSON"

echo "=== Upload API multipart check ==="
UPLOAD_JSON=$(curl -s -b /tmp/admin-cookies.txt -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" \
  -d '{}')
check "upload JSON POST returns 400" "400" "$UPLOAD_JSON"

echo "=== Data dictionary ==="
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const c = await p.dictCategory.count();
  console.log(c);
  await p.\$disconnect();
}
main();
" 2>/dev/null | tail -1)
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

echo "=== Admin pages (authenticated) ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/dict"; do
  CODE=$(curl -s -b /tmp/admin-cookies.txt -o /dev/null -w "%{http_code}" "$BASE$path")
  check "page $path" "200" "$CODE"
done

echo "=== Summary ==="
if [ "$FAIL" -gt 0 ]; then
  echo "$FAIL test(s) failed"
  exit 1
fi
echo "All functional tests passed"
