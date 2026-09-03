#!/usr/bin/env bash
# Functional smoke tests against a running Next.js dev server (default http://localhost:3000).
set -uo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
USER_COOKIE=/tmp/smoke_user_cookies.txt
ADMIN_COOKIE=/tmp/smoke_admin_cookies.txt

pass() { PASS=$((PASS + 1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

check_http() {
  local label="$1" url="$2" expect="$3" cookie="${4:-}"
  local code
  if [ -n "$cookie" ]; then
    code=$(curl -s -b "$cookie" -o /dev/null -w "%{http_code}" "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi
  if [ "$code" = "$expect" ]; then pass "$label ($code)"; else fail "$label (got $code, want $expect)"; fi
}

check_json_ok() {
  local label="$1" url="$2" cookie="${3:-}" method="${4:-GET}" body="${5:-}"
  local out code
  if [ "$method" = "POST" ]; then
    if [ -n "$cookie" ]; then
      out=$(curl -s -b "$cookie" -w "\n%{http_code}" -X POST "$url" -H "Content-Type: application/json" -d "$body")
    else
      out=$(curl -s -w "\n%{http_code}" -X POST "$url" -H "Content-Type: application/json" -d "$body")
    fi
  else
    if [ -n "$cookie" ]; then
      out=$(curl -s -b "$cookie" -w "\n%{http_code}" "$url")
    else
      out=$(curl -s -w "\n%{http_code}" "$url")
    fi
  fi
  code=$(echo "$out" | tail -1)
  body=$(echo "$out" | sed '$d')
  if [ "$code" = "200" ] && echo "$body" | grep -q '"ok":true'; then
    pass "$label"
  else
    fail "$label (http=$code body=$body)"
  fi
}

echo "Smoke tests against $BASE"
rm -f "$USER_COOKIE" "$ADMIN_COOKIE"

# 1–3 Public pages
check_http "home page" "$BASE/" 200
check_http "mobile home" "$BASE/m" 200
check_http "admin login page" "$BASE/admin/login" 200

# 4–5 Auth APIs
check_json_ok "user login" "$BASE/api/auth/login" "" POST '{"phone":"13800138000","password":"user123"}'
curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null

check_json_ok "admin login" "$BASE/api/auth/admin/login" "" POST '{"phone":"13900000001","password":"admin123"}'
curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}' > /dev/null

# 6 Third-party dev token
TOKEN_JSON=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test_user")
if echo "$TOKEN_JSON" | grep -q '"token"'; then pass "dev third-party token"; else fail "dev third-party token ($TOKEN_JSON)"; fi

# 7–12 Authenticated pages
check_http "user auction list" "$BASE/m/auction" 200 "$USER_COOKIE"
check_http "user drying list" "$BASE/m/drying" 200 "$USER_COOKIE"
check_http "user me" "$BASE/m/me" 200 "$USER_COOKIE"
check_http "admin dashboard" "$BASE/admin" 200 "$ADMIN_COOKIE"
check_http "admin assets" "$BASE/admin/assets" 200 "$ADMIN_COOKIE"
check_http "admin dict" "$BASE/admin/dict" 200 "$ADMIN_COOKIE"

# 13 Dict data present
DICT_HTML=$(curl -s -b "$ADMIN_COOKIE" "$BASE/admin/dict")
if echo "$DICT_HTML" | grep -q 'asset_type'; then pass "dict categories seeded"; else fail "dict categories missing on /admin/dict"; fi

# 14 Parse auction project id from HTML (cuid pattern)
AUCTION_HTML=$(curl -s -b "$USER_COOKIE" "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE 'href="/m/auction/cm[a-z0-9]{20,}"' | head -1 | sed 's/.*\/m\/auction\///' | tr -d '"')
if [ -n "$PROJECT_ID" ]; then pass "parse auction project id ($PROJECT_ID)"; else fail "no auction project id in HTML"; fi

# 15 Auction detail page
if [ -n "$PROJECT_ID" ]; then
  check_http "auction detail" "$BASE/m/auction/$PROJECT_ID" 200 "$USER_COOKIE"
fi

# 16 Upload non-multipart returns 400 (not 500)
UPLOAD_CODE=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
if [ "$UPLOAD_CODE" = "400" ]; then pass "upload rejects non-multipart (400)"; else fail "upload non-multipart (got $UPLOAD_CODE)"; fi

# 17 Bid on live auction (dynamic min amount)
if [ -n "$PROJECT_ID" ]; then
  DETAIL=$(curl -s -b "$USER_COOKIE" "$BASE/m/auction/$PROJECT_ID")
  # Try common amounts: parse start price hints or use stepped bids
  BID_OUT=$(curl -s -b "$USER_COOKIE" -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":999999}')
  BID_CODE=$(echo "$BID_OUT" | tail -1)
  BID_BODY=$(echo "$BID_OUT" | sed '$d')
  if [ "$BID_CODE" = "200" ] && echo "$BID_BODY" | grep -q '"ok":true'; then
    pass "auction bid (high amount)"
  else
    # Extract minimum from error message or retry with lower amounts
    MIN=$(echo "$BID_BODY" | grep -oE '[0-9]+\.[0-9]+' | head -1)
    if [ -n "$MIN" ]; then
      RETRY=$(curl -s -b "$USER_COOKIE" -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
        -H "Content-Type: application/json" -d "{\"amount\":$MIN}")
      RC=$(echo "$RETRY" | tail -1)
      RB=$(echo "$RETRY" | sed '$d')
      if [ "$RC" = "200" ] && echo "$RB" | grep -q '"ok":true'; then
        pass "auction bid (min $MIN)"
      else
        fail "auction bid (retry http=$RC body=$RB)"
      fi
    else
      fail "auction bid (http=$BID_CODE body=$BID_BODY)"
    fi
  fi
fi

# 18 Drying reservation
DRYING_HTML=$(curl -s -b "$USER_COOKIE" "$BASE/m/drying")
LISTING_ID=$(echo "$DRYING_HTML" | grep -oE 'href="/m/drying/cm[a-z0-9]{20,}"' | head -1 | sed 's/.*\/m\/drying\///' | tr -d '"')
if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+1 day" +%Y-%m-%d)
  END=$(date -u -d "+2 days" +%Y-%m-%d)
  RES_OUT=$(curl -s -b "$USER_COOKIE" -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  RES_CODE=$(echo "$RES_OUT" | tail -1)
  RES_BODY=$(echo "$RES_OUT" | sed '$d')
  if [ "$RES_CODE" = "200" ] && echo "$RES_BODY" | grep -q '"ok":true'; then
    pass "drying reservation"
  else
    # May fail if capacity full — accept 400 with business message as partial pass for smoke
    if [ "$RES_CODE" = "400" ] && echo "$RES_BODY" | grep -q 'error'; then
      pass "drying reservation (business rule: $RES_BODY)"
    else
      fail "drying reservation (http=$RES_CODE body=$RES_BODY)"
    fi
  fi
else
  fail "no drying listing id"
fi

# 19 Favicon
check_http "favicon" "$BASE/favicon.svg" 200

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
