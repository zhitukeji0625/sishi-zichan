#!/usr/bin/env bash
# Functional smoke test — run from repo root: npm run test:smoke
set -u

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1 — $2"; FAIL=$((FAIL + 1)); }

check_code() {
  local name="$1" url="$2" expected="200"
  shift 2
  if [ $# -gt 0 ] && [[ "$1" =~ ^[0-9]{3}$ ]]; then
    expected="$1"
    shift
  fi
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$@" "$url")
  if [ "$code" = "$expected" ]; then pass "$name"; else fail "$name" "expected $expected, got $code"; fi
}

check_json_ok() {
  local name="$1" resp="$2"
  if echo "$resp" | grep -q '"ok":true'; then pass "$name"; else fail "$name" "$resp"; fi
}

echo "=== Smoke test @ $BASE ==="

# Pages
check_code "GET /" "$BASE/"
check_code "GET /m" "$BASE/m"
check_code "GET /m/login" "$BASE/m/login"
check_code "GET /admin/login" "$BASE/admin/login"
check_code "GET /admin redirect" "$BASE/admin" "307"
check_code "GET /favicon.ico" "$BASE/favicon.ico" "200" -L

# Auth
USER_RESP=$(curl -s -c /tmp/smoke-user.jar -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "user login" "$USER_RESP"

ADMIN_RESP=$(curl -s -c /tmp/smoke-admin.jar -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "admin login" "$ADMIN_RESP"

TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_ext")
if echo "$TP_RESP" | grep -q '"token"'; then pass "third-party token"; else fail "third-party token" "$TP_RESP"; fi

# Dict seeded
DICT_COUNT=$(npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.dictCategory.count().then(c=>{console.log(c);p.\$disconnect()})" 2>/dev/null)
if [ "$DICT_COUNT" = "14" ]; then pass "dict categories (14)"; else fail "dict categories" "count=$DICT_COUNT"; fi

# Admin dict page
check_code "admin dict page" "$BASE/admin/dict" "200" -b /tmp/smoke-admin.jar

# Upload guards
check_code "upload no auth" "$BASE/api/upload" "401" -X POST
check_code "upload non-multipart" "$BASE/api/upload" "400" -b /tmp/smoke-admin.jar -X POST -H "Content-Type: application/json" -d "{}"

# Auction bid flow
PROJECT_ID=$(npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.auctionProject.findFirst({where:{status:'LIVE'}}).then(r=>{console.log(r?.id??'');p.\$disconnect()})" 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
  fail "LIVE auction project" "none found — trigger page load to refresh demo"
  curl -s -o /dev/null "$BASE/m/auction"
  PROJECT_ID=$(npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.auctionProject.findFirst({where:{status:'LIVE'}}).then(r=>{console.log(r?.id??'');p.\$disconnect()})" 2>/dev/null)
fi

if [ -n "$PROJECT_ID" ]; then
  pass "LIVE auction project ($PROJECT_ID)"
  check_code "bid no auth" "$BASE/api/m/auction/${PROJECT_ID}/bid" "401" -X POST -H "Content-Type: application/json" -d '{"amount":8000}'

  CURRENT=$(npx tsx -e "
import{PrismaClient}from'@prisma/client';
const p=new PrismaClient();
const id='$PROJECT_ID';
p.auctionProject.findUnique({where:{id}}).then(async proj=>{
  const top=await p.auctionBid.findFirst({where:{projectId:id},orderBy:{amount:'desc'}});
  const cur=top?Number(top.amount):Number(proj?.startPrice||8000);
  const step=Number(proj?.bidStep||200);
  console.log(cur+step);
  p.\$disconnect();
})" 2>/dev/null)

  BID_RESP=$(curl -s -b /tmp/smoke-user.jar -X POST "$BASE/api/m/auction/${PROJECT_ID}/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$CURRENT}")
  check_json_ok "auction bid" "$BID_RESP"
else
  fail "auction bid" "no LIVE project"
fi

# Drying reserve
LISTING_ID=$(npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.dryingFieldListing.findFirst().then(r=>{console.log(r?.id??'');p.\$disconnect()})" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  RESERVE_RESP=$(curl -s -b /tmp/smoke-user.jar -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-10\",\"endDate\":\"2026-10-12\"}")
  if echo "$RESERVE_RESP" | grep -q '"ok":true'; then
    pass "drying reserve"
  else
    fail "drying reserve" "$RESERVE_RESP"
  fi
else
  fail "drying listing" "none found"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
