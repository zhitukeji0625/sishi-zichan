#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
FAIL=0
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

fail() { echo "FAIL: $1"; FAIL=1; }
ok() { echo "OK: $1"; }

json_post() {
  local url="$1" data="$2"
  curl -s -w '\n%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$url" \
    -H 'Content-Type: application/json' -d "$data"
}

# Login
LOGIN=$(json_post "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}')
CODE=$(echo "$LOGIN" | tail -1)
BODY=$(echo "$LOGIN" | sed '$d')
[[ "$CODE" == "200" ]] && echo "$BODY" | grep -q '"ok":true' && ok "user login" || fail "user login ($CODE)"

# Get live project id from DB via node
PROJECT_ID=$(cd /workspace && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id || ''); return p.\$disconnect(); });
")

if [[ -z "$PROJECT_ID" ]]; then
  fail "no LIVE auction project in DB"
else
  ok "found LIVE project $PROJECT_ID"
  BID=$(json_post "$BASE/api/m/auction/$PROJECT_ID/bid" '{"amount":8200}')
  BCODE=$(echo "$BID" | tail -1)
  BBODY=$(echo "$BID" | sed '$d')
  if [[ "$BCODE" == "200" ]] && echo "$BBODY" | grep -q '"ok":true'; then
    ok "place bid"
  else
    # May fail if already bid at that price - try higher
    CURRENT=$(cd /workspace && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } })
  .then(b => { console.log(b ? Number(b.amount) + 200 : 8200); return p.\$disconnect(); });
")
    BID2=$(json_post "$BASE/api/m/auction/$PROJECT_ID/bid" "{\"amount\":$CURRENT}")
    BCODE2=$(echo "$BID2" | tail -1)
    BBODY2=$(echo "$BID2" | sed '$d')
    [[ "$BCODE2" == "200" ]] && echo "$BBODY2" | grep -q '"ok":true' && ok "place bid (retry $CURRENT)" || fail "place bid ($BCODE2: $BBODY2)"
  fi
fi

# Drying listing
LISTING_ID=$(cd /workspace && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id || ''); return p.\$disconnect(); });
")

if [[ -z "$LISTING_ID" ]]; then
  fail "no OPERATING drying listing"
else
  ok "found drying listing $LISTING_ID"
  START=$(date -u -d '+2 days' +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  END=$(date -u -d '+4 days' +%Y-%m-%d 2>/dev/null || date -u -v+4d +%Y-%m-%d)
  RESERVE=$(json_post "$BASE/api/m/drying/reserve" "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  RCODE=$(echo "$RESERVE" | tail -1)
  RBODY=$(echo "$RESERVE" | sed '$d')
  [[ "$RCODE" == "200" ]] && echo "$RBODY" | grep -q '"ok":true' && ok "drying reserve" || fail "drying reserve ($RCODE: $RBODY)"
fi

# Third-party SSO flow
TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=integration-test")
TOKEN=$(echo "$TP" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).token" 2>/dev/null || true)
if [[ -n "$TOKEN" ]]; then
  SSO_CODE=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" "$BASE/api/auth/third-party" \
    -X POST -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}")
  [[ "$SSO_CODE" == "200" ]] && ok "third-party auth" || fail "third-party auth ($SSO_CODE)"
else
  fail "third-party token parse"
fi

# Register validation (duplicate phone should fail)
REG=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123","name":"dup"}')
REG_CODE=$(echo "$REG" | tail -1)
[[ "$REG_CODE" == "400" || "$REG_CODE" == "409" ]] && ok "register duplicate rejected ($REG_CODE)" || fail "register duplicate ($REG_CODE)"

[[ "$FAIL" -eq 0 ]] && echo "=== INTEGRATION TESTS PASSED ===" || { echo "=== INTEGRATION TESTS FAILED ==="; exit 1; }
