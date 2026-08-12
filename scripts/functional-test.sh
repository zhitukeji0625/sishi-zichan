#!/usr/bin/env bash
# Comprehensive functional tests for 四师资产租赁 platform
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
REPORT="/tmp/sishi-functional-test-report.txt"

ADMIN_PHONE="13900000001"
ADMIN_PASS="admin123"
USER_PHONE="13800138000"
USER_PASS="user123"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

rm -f "$COOKIE_JAR" "$REPORT"

log() { echo "$@" | tee -a "$REPORT"; }

# --- helpers ---
assert_status() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [[ "$actual" == "$expected" ]]; then
    log "PASS: $name (HTTP $actual)"
    ((PASS_COUNT++)) || true
    return 0
  else
    log "FAIL: $name"
    log "  Expected HTTP: $expected"
    log "  Actual HTTP:   $actual"
    log "  Response body: $body"
    ((FAIL_COUNT++)) || true
    return 1
  fi
}

assert_status_one_of() {
  local name="$1" actual="$2" body="$3"
  shift 3
  local expected
  for expected in "$@"; do
    if [[ "$actual" == "$expected" ]]; then
      log "PASS: $name (HTTP $actual)"
      ((PASS_COUNT++)) || true
      return 0
    fi
  done
  log "FAIL: $name"
  log "  Expected one of: $*"
  log "  Actual HTTP:     $actual"
  log "  Response body:   $body"
  ((FAIL_COUNT++)) || true
  return 1
}

assert_json_field() {
  local name="$1" json="$2" field="$3" expected="$4"
  local actual
  actual=$(echo "$json" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j['$field']??'');}catch{console.log('')}})")
  if [[ "$actual" == "$expected" ]]; then
    log "PASS: $name ($field=$actual)"
    ((PASS_COUNT++)) || true
    return 0
  else
    log "FAIL: $name"
    log "  Expected $field: $expected"
    log "  Actual $field:   $actual"
    log "  Full body: $json"
    ((FAIL_COUNT++)) || true
    return 1
  fi
}

http_get() {
  local path="$1"
  local cookie="${2:-}"
  local extra=()
  if [[ -n "$cookie" ]]; then extra+=(-b "$cookie"); fi
  local tmp
  tmp=$(mktemp)
  local code
  code=$(curl -sS -o "$tmp" -w "%{http_code}" "${extra[@]}" "$BASE_URL$path")
  echo "$code"
  cat "$tmp"
  rm -f "$tmp"
}

http_post_json() {
  local path="$1" data="$2"
  local cookie="${3:-}"
  local extra=()
  if [[ -n "$cookie" ]]; then extra+=(-b "$cookie"); fi
  local tmp
  tmp=$(mktemp)
  local code
  code=$(curl -sS -o "$tmp" -w "%{http_code}" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    "${extra[@]}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$data" \
    "$BASE_URL$path")
  echo "$code"
  cat "$tmp"
  rm -f "$tmp"
}

# Query DB for test data (auction IDs, drying listing, min bid)
query_test_data() {
  node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  let live = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
  const ended = await p.auctionProject.findFirst({ where: { status: 'ENDED' } });
  const listing = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  const user = await p.endUser.findUnique({ where: { phone: '$USER_PHONE' } });
  if (!live) {
    const asset = await p.asset.findFirst();
    if (asset && user) {
      const starts = new Date(Date.now() - 60000);
      const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      live = await p.auctionProject.create({
        data: {
          code: 'TEST' + Date.now(),
          assetId: asset.id,
          startPrice: 5000,
          bidStep: 100,
          startsAt: starts,
          endsAt: ends,
          depositAmount: 300,
          status: 'LIVE',
        },
        include: { bids: true },
      });
      await p.auctionRegistration.upsert({
        where: { projectId_endUserId: { projectId: live.id, endUserId: user.id } },
        update: { status: 'APPROVED', depositPaid: true },
        create: { projectId: live.id, endUserId: user.id, status: 'APPROVED', depositPaid: true },
      });
    }
  }
  const topBid = live?.bids?.[0]?.amount;
  const startPrice = live?.startPrice;
  const bidStep = live?.bidStep;
  let minBid = startPrice ? Number(startPrice) : 0;
  if (topBid) minBid = Number(topBid) + Number(bidStep || 0);
  console.log(JSON.stringify({
    liveProjectId: live?.id || null,
    endedProjectId: ended?.id || null,
    dryingListingId: listing?.id || null,
    minBid,
  }));
  await p.\$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
" 2>/dev/null
}

log "============================================================"
log "四师资产租赁 Platform — Functional Test Report"
log "Base URL: $BASE_URL"
log "Started:  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
log "============================================================"
log ""

# --- 1. GET / ---
log "--- Test 1: GET / (homepage) ---"
resp=$(http_get "/")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "Homepage loads" "200" "$code" "$(echo "$body" | head -c 500)"
log ""

# --- 2. GET /m ---
log "--- Test 2: GET /m (mobile homepage) ---"
resp=$(http_get "/m")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "Mobile homepage loads" "200" "$code" "$(echo "$body" | head -c 500)"
log ""

# --- 3. GET /admin/login ---
log "--- Test 3: GET /admin/login ---"
resp=$(http_get "/admin/login")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "Admin login page loads" "200" "$code" "$(echo "$body" | head -c 500)"
log ""

# --- 4. POST /api/auth/admin/login ---
log "--- Test 4: POST /api/auth/admin/login ---"
rm -f "$COOKIE_JAR"
resp=$(http_post_json "/api/auth/admin/login" "{\"phone\":\"$ADMIN_PHONE\",\"password\":\"$ADMIN_PASS\"}")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "Admin login API" "200" "$code" "$body"
if [[ "$code" == "200" ]]; then
  assert_json_field "Admin login returns ok" "$body" "ok" "true"
  if grep -q "sishi_admin_session" "$COOKIE_JAR" 2>/dev/null; then
    log "PASS: Admin session cookie saved"
    ((PASS_COUNT++)) || true
  else
    log "FAIL: Admin session cookie not saved"
    log "  Cookie jar: $(cat "$COOKIE_JAR" 2>/dev/null || echo '(empty)')"
    ((FAIL_COUNT++)) || true
  fi
fi
log ""

# --- 5. GET /admin with admin cookie ---
log "--- Test 5: GET /admin (authenticated) ---"
resp=$(http_get "/admin" "$COOKIE_JAR")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "Admin dashboard" "200" "$code" "$(echo "$body" | head -c 500)"
log ""

# --- 6. Admin sub-pages ---
log "--- Test 6: GET /admin/auctions, /admin/assets, /admin/drying ---"
for path in /admin/auctions /admin/assets /admin/drying; do
  resp=$(http_get "$path" "$COOKIE_JAR")
  code=$(echo "$resp" | head -1)
  body=$(echo "$resp" | tail -n +2)
  assert_status "GET $path" "200" "$code" "$(echo "$body" | head -c 300)"
done
log ""

# --- 7. POST /api/auth/login (user) ---
log "--- Test 7: POST /api/auth/login (user) ---"
rm -f "$COOKIE_JAR"
resp=$(http_post_json "/api/auth/login" "{\"phone\":\"$USER_PHONE\",\"password\":\"$USER_PASS\"}")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "User login API" "200" "$code" "$body"
if [[ "$code" == "200" ]]; then
  assert_json_field "User login returns ok" "$body" "ok" "true"
  if grep -q "sishi_user_session" "$COOKIE_JAR" 2>/dev/null; then
    log "PASS: User session cookie saved"
    ((PASS_COUNT++)) || true
  else
    log "FAIL: User session cookie not saved"
    log "  Cookie jar: $(cat "$COOKIE_JAR" 2>/dev/null || echo '(empty)')"
    ((FAIL_COUNT++)) || true
  fi
fi
USER_COOKIE="$COOKIE_JAR"
log ""

# --- 8. GET /m/me ---
log "--- Test 8: GET /m/me (user profile) ---"
resp=$(http_get "/m/me" "$USER_COOKIE")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "User profile page" "200" "$code" "$(echo "$body" | head -c 500)"
log ""

# --- 9. GET /m/auction ---
log "--- Test 9: GET /m/auction (auction list) ---"
resp=$(http_get "/m/auction" "$USER_COOKIE")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "Auction list page" "200" "$code" "$(echo "$body" | head -c 500)"
log ""

# Fetch test data from DB
TEST_DATA=$(query_test_data)
LIVE_PROJECT_ID=$(echo "$TEST_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.liveProjectId||'')})")
ENDED_PROJECT_ID=$(echo "$TEST_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.endedProjectId||'')})")
DRYING_LISTING_ID=$(echo "$TEST_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.dryingListingId||'')})")
MIN_BID=$(echo "$TEST_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.minBid||0)})")

log "Test data: LIVE=$LIVE_PROJECT_ID ENDED=$ENDED_PROJECT_ID DRYING=$DRYING_LISTING_ID MIN_BID=$MIN_BID"
log ""

# --- 10. Bid on LIVE auction ---
log "--- Test 10: POST bid on LIVE auction ---"
if [[ -z "$LIVE_PROJECT_ID" ]]; then
  log "SKIP: No LIVE auction available and could not create one"
  ((SKIP_COUNT++)) || true
else
  resp=$(http_post_json "/api/m/auction/$LIVE_PROJECT_ID/bid" "{\"amount\":$MIN_BID}" "$USER_COOKIE")
  code=$(echo "$resp" | head -1)
  body=$(echo "$resp" | tail -n +2)
  assert_status "Bid on LIVE auction" "200" "$code" "$body"
  if [[ "$code" == "200" ]]; then
    assert_json_field "Bid returns ok" "$body" "ok" "true"
  fi
fi
log ""

# --- 11. GET /m/drying ---
log "--- Test 11: GET /m/drying (drying page) ---"
resp=$(http_get "/m/drying" "$USER_COOKIE")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "Drying page loads" "200" "$code" "$(echo "$body" | head -c 500)"
log ""

# --- 12. POST /api/m/drying/reserve ---
log "--- Test 12: POST /api/m/drying/reserve ---"
if [[ -z "$DRYING_LISTING_ID" ]]; then
  log "SKIP: No OPERATING drying listing found"
  ((SKIP_COUNT++)) || true
else
  START_DATE=$(date -u -d "+3 days" '+%Y-%m-%d' 2>/dev/null || date -u -v+3d '+%Y-%m-%d')
  END_DATE=$(date -u -d "+4 days" '+%Y-%m-%d' 2>/dev/null || date -u -v+4d '+%Y-%m-%d')
  resp=$(http_post_json "/api/m/drying/reserve" \
    "{\"listingId\":\"$DRYING_LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}" \
    "$USER_COOKIE")
  code=$(echo "$resp" | head -1)
  body=$(echo "$resp" | tail -n +2)
  assert_status "Drying reservation" "200" "$code" "$body"
  if [[ "$code" == "200" ]]; then
    assert_json_field "Reserve returns ok" "$body" "ok" "true"
  fi
fi
log ""

# --- 13. Third-party auth flow ---
log "--- Test 13: Third-party token + auth ---"
resp=$(http_get "/api/dev/third-party-token?u_id=testuser")
code=$(echo "$resp" | head -1)
body=$(echo "$resp" | tail -n +2)
assert_status "GET /api/dev/third-party-token" "200" "$code" "$body"
TOKEN=$(echo "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
if [[ -n "$TOKEN" ]]; then
  log "PASS: Third-party token obtained"
  ((PASS_COUNT++)) || true
  rm -f "$COOKIE_JAR"
  resp=$(http_post_json "/api/auth/third-party" "{\"token\":\"$TOKEN\"}")
  code=$(echo "$resp" | head -1)
  body=$(echo "$resp" | tail -n +2)
  assert_status "POST /api/auth/third-party" "200" "$code" "$body"
  if [[ "$code" == "200" ]]; then
    assert_json_field "Third-party auth ok" "$body" "ok" "true"
  fi
else
  log "FAIL: Could not extract token from third-party-token response"
  log "  Body: $body"
  ((FAIL_COUNT++)) || true
fi
# Restore user cookie for edge case tests
rm -f "$COOKIE_JAR"
http_post_json "/api/auth/login" "{\"phone\":\"$USER_PHONE\",\"password\":\"$USER_PASS\"}" > /dev/null
log ""

# --- 14. Edge cases ---
log "--- Test 14a: Bid on ENDED auction (expect 400) ---"
if [[ -z "$ENDED_PROJECT_ID" ]]; then
  log "SKIP: No ENDED auction found"
  ((SKIP_COUNT++)) || true
else
  resp=$(http_post_json "/api/m/auction/$ENDED_PROJECT_ID/bid" "{\"amount\":99999}" "$USER_COOKIE")
  code=$(echo "$resp" | head -1)
  body=$(echo "$resp" | tail -n +2)
  assert_status "Bid on ENDED auction rejected" "400" "$code" "$body"
fi
log ""

log "--- Test 14b: Rent payment on LIVE auction (expect 403) ---"
if [[ -z "$LIVE_PROJECT_ID" ]]; then
  log "SKIP: No LIVE auction for rent payment edge case"
  ((SKIP_COUNT++)) || true
else
  resp=$(http_post_json "/api/m/payments/mock" \
    "{\"purpose\":\"AUCTION_RENT\",\"auctionProjectId\":\"$LIVE_PROJECT_ID\"}" \
    "$USER_COOKIE")
  code=$(echo "$resp" | head -1)
  body=$(echo "$resp" | tail -n +2)
  assert_status "Rent payment on LIVE auction rejected" "403" "$code" "$body"
fi
log ""

# --- Summary ---
log "============================================================"
log "SUMMARY"
log "  PASSED:  $PASS_COUNT"
log "  FAILED:  $FAIL_COUNT"
log "  SKIPPED: $SKIP_COUNT"
log "  TOTAL:   $((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))"
log "Finished: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
log "============================================================"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
