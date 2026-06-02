#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
FAIL=0
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}' > /dev/null

check_page() {
  local name="$1" url="$2" jar="${3:-}"
  local code
  if [[ -n "$jar" ]]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -b "$jar" "$url")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  fi
  if [[ "$code" == "200" ]]; then echo "OK: $name"; else echo "FAIL: $name ($code)"; FAIL=1; fi
}

echo "=== Admin pages ==="
for path in /admin /admin/assets /admin/auctions /admin/announcements /admin/organizations \
  /admin/admins /admin/audit /admin/config /admin/dict /admin/drying /admin/registrations; do
  check_page "$path" "$BASE$path" "$ADMIN_JAR"
done

echo "=== Mobile pages ==="
for path in /m /m/auction /m/drying /m/me /m/orders /m/register; do
  check_page "$path" "$BASE$path" "$USER_JAR"
done

PROJECT_ID=$(cd /workspace && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id||''); return p.\$disconnect(); });
")
if [[ -n "$PROJECT_ID" ]]; then
  check_page "/m/auction/[id]" "$BASE/m/auction/$PROJECT_ID" "$USER_JAR"
fi

LISTING_ID=$(cd /workspace && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id||''); return p.\$disconnect(); });
")
if [[ -n "$LISTING_ID" ]]; then
  check_page "/m/drying/[id]" "$BASE/m/drying/$LISTING_ID" "$USER_JAR"
fi

[[ "$FAIL" -eq 0 ]] && echo "=== PAGE TESTS PASSED ===" || { echo "=== PAGE TESTS FAILED ==="; exit 1; }
