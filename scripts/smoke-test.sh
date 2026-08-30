#!/usr/bin/env bash
# Smoke test for sishi-zichan — run with dev server on :3000 and DB seeded.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}"

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  OK  $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test @ $BASE ==="

# Pages
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# User auth
USER_JAR="$TMPDIR/smoke-user-$$.txt"
USER_RESP="$(curl -s -c "$USER_JAR" -b "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')"
echo "$USER_RESP" | grep -q '"ok":true' && check "user login" ok ok || check "user login" ok fail

# Admin must use admin login endpoint
ADMIN_WRONG="$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')"
echo "$ADMIN_WRONG" | grep -q '"error"' && check "admin wrong endpoint rejected" ok ok || check "admin wrong endpoint rejected" ok fail

ADMIN_JAR="$TMPDIR/smoke-admin-$$.txt"
ADMIN_RESP="$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')"
echo "$ADMIN_RESP" | grep -q '"ok":true' && check "admin login" ok ok || check "admin login" ok fail

check "GET /admin/dict (auth)" 200 "$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/dict")"
check "GET /admin/assets (auth)" 200 "$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/assets")"
check "GET /admin/auctions (auth)" 200 "$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/auctions")"

# Dev third-party token
TP="$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test")"
echo "$TP" | grep -q '"token"' && check "dev third-party token" ok ok || check "dev third-party token" ok fail

# DB checks via node
DICT_COUNT="$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(n => { console.log(n); return p.\$disconnect(); });
" 2>/dev/null | tail -1)"
[[ "${DICT_COUNT:-0}" -gt 0 ]] && check "dict categories seeded" ok ok || check "dict categories seeded" ok fail

LIVE_COUNT="$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.count({ where: { status: 'LIVE' } }).then(n => { console.log(n); return p.\$disconnect(); });
" 2>/dev/null | tail -1)"
[[ "${LIVE_COUNT:-0}" -gt 0 ]] && check "live auction exists" ok ok || check "live auction exists" ok fail

# Trigger layout refresh (demo auction reset)
curl -s -o /dev/null "$BASE/m/auction"
LIVE_AFTER="$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.count({ where: { status: 'LIVE' } }).then(n => { console.log(n); return p.\$disconnect(); });
" 2>/dev/null | tail -1)"
[[ "${LIVE_AFTER:-0}" -gt 0 ]] && check "demo auction refresh" ok ok || check "demo auction refresh" ok fail

# Bid test (if live auction)
PROJECT_INFO="$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
(async () => {
  const project = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!project) { console.log(''); return; }
  const top = project.bids[0]?.amount;
  const minNext = top
    ? new Decimal(top.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(project.id + '|' + minNext.toFixed(2));
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)"
if [[ -n "$PROJECT_INFO" && "$PROJECT_INFO" == *"|"* ]]; then
  PROJECT_ID="${PROJECT_INFO%%|*}"
  BID_AMOUNT="${PROJECT_INFO##*|}"
  BID_RESP="$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$BID_AMOUNT}")"
  echo "$BID_RESP" | grep -q '"ok":true' && check "user bid" ok ok || check "user bid" ok fail
else
  check "user bid (skipped: no live project)" ok ok
fi

rm -f "$USER_JAR" "$ADMIN_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
