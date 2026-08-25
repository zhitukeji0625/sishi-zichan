#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "OK   $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name expected=$expect got=$actual"
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1" body="$2"
  local ok
  ok=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "False")
  if [ "$ok" = "True" ]; then
    echo "OK   $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name body=$body"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke test against $BASE"

check "GET /" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"
check "GET /icon" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/icon")"
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")"
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")"

USER_LOGIN=$(curl -s -c /tmp/smoke_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "POST /api/auth/login" "$USER_LOGIN"

ADMIN_LOGIN=$(curl -s -c /tmp/smoke_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "POST /api/auth/admin/login" "$ADMIN_LOGIN"

check "GET /admin/dict" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt "$BASE/admin/dict")"
check "GET /admin/drying" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt "$BASE/admin/drying")"
check "GET /admin/assets" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt "$BASE/admin/assets")"
check "GET /admin/auctions" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt "$BASE/admin/auctions")"

check "POST /api/upload invalid" 400 "$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d "{}")"

TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke")
if echo "$TP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('token') else 1)" 2>/dev/null; then
  echo "OK   GET /api/dev/third-party-token"
  PASS=$((PASS + 1))
else
  echo "FAIL GET /api/dev/third-party-token body=$TP"
  FAIL=$((FAIL + 1))
fi

# Trigger layout refresh (demo auction reset)
curl -s -o /dev/null "$BASE/m/auction"
AUC_STATUS=$(cd "$(dirname "$0")/.." && npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.auctionProject.findFirst({orderBy:{createdAt:'desc'},select:{status:true}}).then(r=>{console.log(r?.status??'NONE'); return p.\$disconnect()})")
check "demo auction LIVE" "LIVE" "$AUC_STATUS"

DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.dictCategory.count().then(c=>{console.log(c); return p.\$disconnect()})")
if [ "$DICT_COUNT" -ge 10 ]; then
  echo "OK   dict categories ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "FAIL dict categories expected>=10 got=$DICT_COUNT"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "SUMMARY: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
