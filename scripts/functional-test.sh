#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE (default http://localhost:3000)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/ft_user_cookies.txt}"
ADMIN_JAR="${ADMIN_JAR:-/tmp/ft_admin_cookies.txt}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

pass=0
fail=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "PASS: $name"
    pass=$((pass + 1))
  else
    echo "FAIL: $name (expected $expect, got $actual)"
    fail=$((fail + 1))
  fi
}

read -r PROJECT_ID BID_AMOUNT <<EOF
$(cd "$ROOT" && npx tsx <<'TS'
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
const p = new PrismaClient();
async function main() {
  const user = await p.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!user) return;
  const reg = await p.auctionRegistration.findFirst({
    where: { endUserId: user.id, status: "APPROVED", depositPaid: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;
  const project = await p.auctionProject.findUnique({ where: { id: reg.projectId } });
  if (!project) return;
  const top = await p.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const minNext = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(project.id, minNext.toFixed(2));
}
main().finally(() => p.$disconnect());
TS
)
EOF

echo "Functional tests against $BASE"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" || echo "000")
check "GET /" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login" || echo "000")
check "GET /admin/login" "200" "$code"

resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
ok=$(echo "$resp" | grep -o '"ok":true' || true)
check "POST /api/auth/login" "ok" "$([ -n "$ok" ] && echo ok || echo fail)"

resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
ok=$(echo "$resp" | grep -o '"ok":true' || true)
check "POST /api/auth/admin/login" "ok" "$([ -n "$ok" ] && echo ok || echo fail)"

code=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{"name":"x"}' || echo "000")
check "POST /api/admin/assets (json) -> 400" "400" "$code"

if [ -z "$PROJECT_ID" ] || [ -z "$BID_AMOUNT" ]; then
  echo "FAIL: could not resolve demo auction project / bid amount"
  fail=$((fail + 1))
else
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d '{"amount":9999}' || echo "000")
  check "POST bid no auth -> 401" "401" "$code"

  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$BID_AMOUNT}")
  bid_ok=$(echo "$resp" | grep -o '"ok":true' || true)
  check "POST bid with auth (amount=$BID_AMOUNT)" "ok" "$([ -n "$bid_ok" ] && echo ok || echo fail)"
  if [ -z "$bid_ok" ]; then echo "  response: $resp"; fi
fi

code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H 'Content-Type: application/json' -d '{}' || echo "000")
check "POST drying reserve invalid -> 400" "400" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123" || echo "000")
check "GET third-party-token" "200" "$code"

echo "--- Results: $pass passed, $fail failed ---"
[ "$fail" -eq 0 ]
