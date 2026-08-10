#!/usr/bin/env bash
# Functional smoke tests against a running dev server (default http://localhost:3000).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
ADMIN_COOKIE="/tmp/ft_admin_cookies.txt"
USER_COOKIE="/tmp/ft_user_cookies.txt"
rm -f "$ADMIN_COOKIE" "$USER_COOKIE"
ERRORS=0

fail() { echo "FAIL: $1"; ERRORS=$((ERRORS + 1)); }
ok() { echo "OK: $1"; }

echo "=== Page smoke tests ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then ok "GET $path"; else fail "GET $path (got $code)"; fi
done

echo ""
echo "=== Auth ==="
RESP=$(curl -s -c "$ADMIN_COOKIE" -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
if echo "$RESP" | grep -q '"ok":true'; then ok "Admin login"; else fail "Admin login: $RESP"; fi

RESP=$(curl -s -c "$USER_COOKIE" -b "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
if echo "$RESP" | grep -q '"ok":true'; then ok "User login"; else fail "User login: $RESP"; fi

echo ""
echo "=== Admin pages (authenticated) ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/registrations" "/admin/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE$path")
  if [ "$code" = "200" ]; then ok "GET $path"; else fail "GET $path (got $code)"; fi
done

echo ""
echo "=== Mobile pages (authenticated) ==="
for path in "/m/me" "/m/orders" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE$path")
  if [ "$code" = "200" ]; then ok "GET $path"; else fail "GET $path (got $code)"; fi
done

echo ""
echo "=== Third-party auth ==="
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=ft_sso_user" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
RESP=$(curl -s -c "$USER_COOKIE" -b "$USER_COOKIE" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
if echo "$RESP" | grep -q '"ok":true'; then ok "Third-party auth"; else fail "Third-party auth: $RESP"; fi

echo ""
echo "=== Drying reservation ==="
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  const l=await p.dryingFieldListing.findFirst();
  console.log(l?.id||'');
  await p.\$disconnect();
})()
" 2>/dev/null)
RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-03\"}")
if echo "$RESP" | grep -q '"ok":true'; then ok "Drying reservation"; else fail "Drying reservation: $RESP"; fi

echo ""
echo "=== Demo auction bid ==="
# Re-login as demo user (third-party auth may have switched session)
curl -s -c "$USER_COOKIE" -b "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  const user=await p.endUser.findUnique({where:{phone:'13800138000'}});
  const reg=await p.auctionRegistration.findFirst({
    where:{
      endUserId:user?.id,
      status:'APPROVED',
      depositPaid:true,
      project:{status:'LIVE',endsAt:{gt:new Date()}}
    },
    include:{project:true}
  });
  console.log(reg?.projectId||'');
  await p.\$disconnect();
})()
" 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  fail "No active demo auction project found (run npm run db:seed)"
else
  START_PRICE=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  const proj=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'}});
  console.log(proj?.startPrice?.toString()||'');
  await p.\$disconnect();
})()
" 2>/dev/null)
  RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$START_PRICE}")
  if echo "$RESP" | grep -q '"ok":true'; then ok "Auction bid"; else fail "Auction bid: $RESP"; fi
fi

echo ""
echo "=== API protection ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{"listingId":"x","startDate":"2026-09-01","endDate":"2026-09-02"}')
if [ "$code" = "401" ]; then ok "Unauthenticated API blocked"; else fail "Unauthenticated API (got $code)"; fi

echo ""
echo "=== Logout ==="
RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")
if echo "$RESP" | grep -q '"ok":true'; then ok "User logout"; else fail "User logout: $RESP"; fi
RESP=$(curl -s -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/logout")
if echo "$RESP" | grep -q '"ok":true'; then ok "Admin logout"; else fail "Admin logout: $RESP"; fi

echo ""
echo "=== Summary: $ERRORS error(s) ==="
exit "$ERRORS"
