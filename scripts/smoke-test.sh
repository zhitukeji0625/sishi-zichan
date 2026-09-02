#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_error() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"error"'; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

echo "=== Smoke test @ $BASE ==="

echo "[pages]"
for path in "/" "/m" "/m/login" "/m/auction" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

echo "[admin auth]"
body=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "admin login" "$body"

code=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "GET /admin" "200" "$code"

code=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin/dict")
assert_status "GET /admin/dict" "200" "$code"

echo "[dict data]"
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dictCategory.count().then(c => { console.log(c); p.\$disconnect(); });
" 2>/dev/null)
if [ "${DICT_COUNT:-0}" -ge 14 ]; then
  echo "  ✓ dict categories ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "  ✗ dict categories (expected >=14, got ${DICT_COUNT:-0})"
  FAIL=$((FAIL + 1))
fi

echo "[upload validation]"
body=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"test":1}')
code=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"test":1}')
assert_status "upload non-multipart" "400" "$code"
assert_json_error "upload error body" "$body"

echo "[user auth & auction]"
body=$(curl -s -c "$USER_JAR" -b "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "user login" "$body"

# Trigger layout refresh (demo auction restore)
curl -s -o /dev/null "$BASE/"

LIVE_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true, startPrice: true, bidStep: true } })
  .then(async r => {
    if (!r) { console.log(''); await p.\$disconnect(); return; }
    const top = await p.auctionBid.findFirst({ where: { projectId: r.id }, orderBy: { amount: 'desc' } });
    const min = top ? Number(top.amount) + Number(r.bidStep) : Number(r.startPrice);
    console.log(r.id + ' ' + min);
    await p.\$disconnect();
  });
" 2>/dev/null)

if [ -z "$LIVE_ID" ]; then
  echo "  ✗ no LIVE auction project"
  FAIL=$((FAIL + 1))
else
  PROJECT_ID=$(echo "$LIVE_ID" | awk '{print $1}')
  MIN_BID=$(echo "$LIVE_ID" | awk '{print $2}')
  echo "  ✓ LIVE auction ($PROJECT_ID, min bid $MIN_BID)"
  PASS=$((PASS + 1))

  body=$(curl -s -c "$USER_JAR" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  assert_json_ok "place bid" "$body"
fi

echo "[third-party token]"
body=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
if echo "$body" | grep -q '"token"'; then
  echo "  ✓ third-party token"
  PASS=$((PASS + 1))
  TOKEN=$(echo "$body" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  body=$(curl -s -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  assert_json_ok "third-party login" "$body"
else
  echo "  ✗ third-party token: $body"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
