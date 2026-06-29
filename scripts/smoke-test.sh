#!/usr/bin/env bash
# Functional smoke tests against running dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== Smoke tests @ $BASE ==="

# Public pages
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

# User login
code=$(curl -s -o /tmp/login.json -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_status "POST /api/auth/login" "200" "$code"
grep -q '"ok":true' /tmp/login.json && pass "login body" || fail "login body"

# Admin login
code=$(curl -s -o /tmp/admin-login.json -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_status "POST /api/auth/admin/login" "200" "$code"
grep -q '"ok":true' /tmp/admin-login.json && pass "admin login body" || fail "admin login body"

# Protected admin page (with cookie)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check_status "GET /admin (authenticated)" "200" "$code"

# Protected mobile page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check_status "GET /m/me (authenticated)" "200" "$code"

# Invalid login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check_status "POST /api/auth/login bad password" "401" "$code"

# Register validation (missing fields)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{}')
if [ "$code" = "400" ] || [ "$code" = "422" ]; then pass "POST /api/auth/register validation ($code)"; else fail "POST /api/auth/register validation (got $code)"; fi

# Admin assets API (POST only — create requires form)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/api/admin/assets")
if [ "$code" = "405" ]; then pass "GET /api/admin/assets returns 405 (POST only)"; else check_status "GET /api/admin/assets" "405" "$code"; fi

# Auction bid without auth
PROJECT_ID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.auctionProject.findFirst({where:{status:'LIVE'},select:{id:true}})
  .then(r=>{console.log(r?.id||'');return p.\$disconnect();})
  .catch(()=>process.exit(1));
" 2>/dev/null || echo "")
if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":100}')
  if [ "$code" = "401" ] || [ "$code" = "403" ]; then pass "POST bid without auth ($code)"; else fail "POST bid without auth (got $code)"; fi
else
  echo "  SKIP: no LIVE auction project"
fi

# Logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
check_status "POST /api/auth/logout" "200" "$code"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "=== $FAIL test(s) failed ==="
  exit 1
fi
echo "=== All smoke tests passed ==="
