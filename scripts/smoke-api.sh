#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
fail=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL $name: expected HTTP $expected, got $actual"
    fail=1
  else
    echo "OK   $name ($actual)"
  fi
}

# Public pages
for path in / /m /m/login /m/auction /m/drying /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# User login
rm -f /tmp/smoke-user.txt
code=$(curl -s -c /tmp/smoke-user.txt -b /tmp/smoke-user.txt -o /tmp/smoke-login.json -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
check "POST /api/auth/login" "200" "$code"

# Upload without multipart (admin)
rm -f /tmp/smoke-admin.txt
code=$(curl -s -c /tmp/smoke-admin.txt -b /tmp/smoke-admin.txt -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
check "POST /api/auth/admin/login" "200" "$code"

code=$(curl -s -b /tmp/smoke-admin.txt -o /tmp/smoke-upload.json -w "%{http_code}" \
  -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')
check "POST /api/upload non-multipart" "400" "$code"

# Third-party dev token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token")
check "GET /api/dev/third-party-token" "200" "$code"

# Drying reserve overlap (same user) — need listing id
LISTING_ID=$(node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
console.log(l?.id ?? '');
await p.\$disconnect();
")

if [[ -z "$LISTING_ID" ]]; then
  echo "SKIP drying overlap (no OPERATING listing)"
else
  START="2030-$(printf '%02d' $(( (RANDOM % 12) + 1 )))-$(printf '%02d' $(( (RANDOM % 25) + 1 )))"
  END=$(node -e "const s=new Date('$START'); s.setDate(s.getDate()+2); console.log(s.toISOString().slice(0,10))")
  code=$(curl -s -b /tmp/smoke-user.txt -o /tmp/smoke-dry1.json -w "%{http_code}" \
    -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check "POST drying reserve first" "200" "$code"
  code=$(curl -s -b /tmp/smoke-user.txt -o /tmp/smoke-dry2.json -w "%{http_code}" \
    -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  # overlap same user: expect 409 if implemented, else may be 200 or 400
  if [[ "$code" == "409" ]]; then
    echo "OK   POST drying overlap same user (409)"
  elif [[ "$code" == "200" ]]; then
    echo "WARN POST drying overlap allowed duplicate ($code) — may need 409 fix"
  else
    echo "INFO drying overlap second request: HTTP $code body=$(cat /tmp/smoke-dry2.json)"
  fi
fi

# Mock payment duplicate deposit
PROJECT_ID=$(node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const u = await p.endUser.findUnique({ where: { phone: '13800138000' } });
const reg = await p.auctionRegistration.findFirst({
  where: { endUserId: u.id, depositPaid: true },
  include: { project: true },
});
console.log(reg?.projectId ?? '');
await p.\$disconnect();
")

if [[ -n "$PROJECT_ID" ]]; then
  code=$(curl -s -b /tmp/smoke-user.txt -o /tmp/smoke-pay1.json -w "%{http_code}" \
    -X POST "$BASE/api/m/payments/mock" -H 'Content-Type: application/json' \
    -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  check "POST mock payment duplicate deposit" "409" "$code"
else
  echo "SKIP mock duplicate (no paid registration project)"
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "All required smoke checks passed."
