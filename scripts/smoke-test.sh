#!/usr/bin/env bash
# Functional smoke tests — run from repo root: npm run test:smoke
set -euo pipefail
export LANG=C.UTF-8 LC_ALL=C.UTF-8

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

pass() { echo "PASS $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL $1 (expected=$2 got=$3)"; FAIL=$((FAIL + 1)); }

check_code() {
  local name="$1" expect="$2" url="$3"
  local extra=()
  shift 3
  while [[ $# -gt 0 ]]; do extra+=("$1"); shift; done
  local got
  got=$(curl -s -o /dev/null -w "%{http_code}" "${extra[@]}" "$url" || echo "ERR")
  if [[ "$got" == "$expect" ]]; then pass "$name ($got)"; else fail "$name" "$expect" "$got"; fi
}

echo "Smoke test against $BASE"

check_code home 200 "$BASE/"
check_code admin-login-page 200 "$BASE/admin/login"
check_code m-home 200 "$BASE/m"
check_code m-login 200 "$BASE/m/login"
check_code favicon-svg 200 "$BASE/favicon.svg"

ADMIN_COOKIE=$(mktemp)
USER_COOKIE=$(mktemp)
trap 'rm -f "$ADMIN_COOKIE" "$USER_COOKIE"' EXIT

check_code admin-login-api 200 "$BASE/api/auth/admin/login" \
  -c "$ADMIN_COOKIE" -X POST -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}'

check_code user-login-api 200 "$BASE/api/auth/login" \
  -c "$USER_COOKIE" -X POST -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}'

for path in /admin /admin/assets /admin/auctions /admin/dict /admin/drying /admin/organizations; do
  check_code "admin${path}" 200 "$BASE$path" -b "$ADMIN_COOKIE"
done

# Dict categories seeded (check database count)
dict_count=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then((c) => { console.log(c); return p.\$disconnect(); });
" 2>/dev/null | tail -1)
if [[ "${dict_count:-0}" -ge 10 ]]; then
  pass "dict-seeded ($dict_count categories)"
else
  fail "dict-seeded" ">=10" "${dict_count:-0}"
fi

check_code upload-no-auth 401 "$BASE/api/upload" -X POST
check_code upload-non-multipart 400 "$BASE/api/upload" \
  -b "$ADMIN_COOKIE" -X POST -H "Content-Type: application/json" -d '{}'

check_code third-party-token 200 "$BASE/api/dev/third-party-token?u_id=test"
check_code m-auction 200 "$BASE/m/auction"
check_code m-drying 200 "$BASE/m/drying"

# Demo auction should be LIVE after layout refresh
auction_html=$(curl -s "$BASE/m/auction")
if echo "$auction_html" | grep -q "status-live"; then
  pass "demo-auction-live"
else
  fail "demo-auction-live" "status-live" "not found"
fi

# Bid flow: parse project id from auction list links
project_id=$(echo "$auction_html" | grep -oE 'href="/m/auction/[a-zA-Z0-9]+"' | head -1 | sed 's|href="/m/auction/||;s/"$//' || true)
if [[ -n "$project_id" ]]; then
  detail=$(curl -s -b "$USER_COOKIE" "$BASE/m/auction/$project_id")
  min_bid=$(echo "$detail" | grep -oE 'min="[0-9.]+"' | head -1 | grep -oE '[0-9.]+' || true)
  if [[ -z "$min_bid" ]]; then
    min_bid=$(echo "$detail" | grep -oE 'minBid\\":[0-9.]+' | head -1 | sed 's/minBid\\"://' || true)
  fi
  if [[ -n "$min_bid" ]]; then
    bid_res=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$project_id/bid" \
      -H "Content-Type: application/json" -d "{\"amount\":$min_bid}")
    if echo "$bid_res" | grep -q '"ok":true'; then
      pass "auction-bid"
    else
      fail "auction-bid" '{"ok":true}' "$bid_res"
    fi
  else
    fail "auction-bid" "min bid parsed" "could not parse min bid"
  fi
else
  fail "auction-bid" "project id" "not found"
fi

echo "---"
echo "TOTAL: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
