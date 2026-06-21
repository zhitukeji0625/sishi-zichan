#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

ok() { echo "  OK: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

check_page() {
  local path="$1" name="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ]; then
    ok "$name ($code)"
  else
    fail "$name expected 200/302/307 got $code"
  fi
}

check_json() {
  local method="$1" url="$2" jar="$3" body="$4" expect="$5" name="$6"
  local resp
  if [ -n "$body" ]; then
    resp=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -b "$jar" -c "$jar" -d "$body" "$url")
  else
    resp=$(curl -s -w "\n%{http_code}" -X "$method" -b "$jar" -c "$jar" "$url")
  fi
  local code body_out
  code=$(echo "$resp" | tail -1)
  body_out=$(echo "$resp" | sed '$d')
  if echo "$body_out" | grep -q "$expect" && [ "$code" != "500" ]; then
    ok "$name ($code)"
  else
    fail "$name ($code) body=$body_out expected=$expect"
  fi
}

echo "=== Smoke test $BASE ==="

echo "[Pages]"
check_page "/" "门户首页"
check_page "/m" "移动端 H5"
check_page "/admin/login" "管理后台登录"

echo "[Auth]"
check_json POST "$BASE/api/auth/admin/login" "$ADMIN_JAR" '{"phone":"13900000001","password":"admin123"}' '"ok":true' "管理员登录"
check_json POST "$BASE/api/auth/login" "$COOKIE_JAR" '{"phone":"13800138000","password":"user123"}' '"ok":true' "用户登录"

echo "[Admin API]"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets")
if [ "$code" = "400" ] || [ "$code" = "401" ]; then ok "管理端资产创建需表单 ($code)"; else fail "管理端资产创建 expected 400/401 got $code"; fi
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
if [ "$code" = "200" ]; then ok "管理端资产页面 ($code)"; else fail "管理端资产页面 expected 200 got $code"; fi

echo "[Third-party token]"
token_resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=demo-user")
if echo "$token_resp" | grep -q '"token"'; then ok "第三方 token"; else fail "第三方 token: $token_resp"; fi

echo "[Auction]"
# Get LIVE project id from DB via node
PROJECT_ID=$(cd /workspace && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  const proj=await p.auctionProject.findFirst({where:{status:'LIVE'},orderBy:{createdAt:'desc'}});
  if(proj) process.stdout.write(proj.id);
  await p.\$disconnect();
})();
")
if [ -z "$PROJECT_ID" ]; then
  fail "无 LIVE 竞拍项目"
else
  # probe min bid
  top=$(cd /workspace && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  const proj=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'}});
  const top=await p.auctionBid.findFirst({where:{projectId:'$PROJECT_ID'},orderBy:{amount:'desc'}});
  const min=top?Number(top.amount)+Number(proj.bidStep):Number(proj.startPrice);
  process.stdout.write(String(min));
  await p.\$disconnect();
})();
")
  check_json POST "$BASE/api/m/auction/$PROJECT_ID/bid" "$COOKIE_JAR" "{\"amount\":$top}" '"ok":true' "竞拍出价"
  check_json POST "$BASE/api/m/payments/mock" "$COOKIE_JAR" "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PROJECT_ID\"}" '"保证金已缴纳"' "竞拍保证金幂等(409)"
fi

echo "[Drying reserve]"
LISTING_ID=$(cd /workspace && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  const l=await p.dryingFieldListing.findFirst({where:{status:'OPERATING'}});
  if(l) process.stdout.write(l.id);
  await p.\$disconnect();
})();
")
if [ -z "$LISTING_ID" ]; then
  fail "无运营中晒场"
else
  START=$(date -u -d "+2 days" +%Y-%m-%d)
  END=$(date -u -d "+3 days" +%Y-%m-%d)
  check_json POST "$BASE/api/m/drying/reserve" "$COOKIE_JAR" "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}" '"ok":true' "晒场预约"
fi

echo "[Register validation]"
check_json POST "$BASE/api/auth/register" "$COOKIE_JAR" '{"phone":"","password":""}' '参数无效' "注册参数校验"

echo "=== Results: $PASS passed, $FAIL failed ==="
rm -f "$COOKIE_JAR" "$ADMIN_JAR"
[ "$FAIL" -eq 0 ]
