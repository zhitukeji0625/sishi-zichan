#!/usr/bin/env bash
# 功能完整性 smoke + API 全流程测试（需 dev server + MariaDB + seed）
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp/sishi-ft}"
mkdir -p "$TMPDIR"

pass() { PASS=$((PASS + 1)); echo "  OK  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

check_code() {
  local label="$1" url="$2" expect="$3" cookie="${4:-}"
  local code
  if [ -n "$cookie" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie" "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi
  if [ "$code" = "$expect" ]; then pass "$label ($code)"; else fail "$label (got $code, want $expect)"; fi
}

check_json() {
  local label="$1" url="$2" cookie="$3" method="${4:-GET}" body="${5:-}"
  local resp code
  if [ "$method" = "GET" ]; then
    resp=$(curl -s -w "\n%{http_code}" -b "$cookie" "$url")
  else
    resp=$(curl -s -w "\n%{http_code}" -b "$cookie" -X "$method" "$url" \
      -H "Content-Type: application/json" -d "$body")
  fi
  code=$(echo "$resp" | tail -1)
  body_out=$(echo "$resp" | sed '$d')
  if [ "$code" = "200" ] && echo "$body_out" | grep -q '"ok"'; then
    pass "$label"
  else
    fail "$label (code=$code body=$body_out)"
  fi
}

echo "=== 页面 smoke ==="
check_code "首页" "$BASE/" 200
check_code "移动端首页" "$BASE/m" 200
check_code "用户登录页" "$BASE/m/login" 200
check_code "管理登录页" "$BASE/admin/login" 200
check_code "注册页" "$BASE/m/register" 200

echo "=== 登录 ==="
USER_COOKIE="$TMPDIR/user.txt"
ADMIN_COOKIE="$TMPDIR/admin.txt"
curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' | grep -q '"ok"' && pass "用户登录" || fail "用户登录"
curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' | grep -q '"ok"' && pass "管理员登录" || fail "管理员登录"

echo "=== 认证页面 ==="
for path in m/me m/auction m/drying m/orders admin admin/assets admin/auctions admin/drying \
  admin/organizations admin/admins admin/announcements admin/audit admin/config admin/dict admin/registrations; do
  cookie="$USER_COOKIE"
  [[ "$path" == admin* ]] && cookie="$ADMIN_COOKIE"
  check_code "$path" "$BASE/$path" 200 "$cookie"
done

echo "=== API 错误处理（空 body 应 400）==="
for ep in api/upload api/admin/assets; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/$ep")
  if [ "$code" = "400" ]; then pass "$ep 空 body -> 400"; else fail "$ep 空 body (got $code)"; fi
done

echo "=== 竞拍重置为 LIVE ==="
PROJECT_ID=$(npx tsx -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.auctionProject.findFirst().then(async proj=>{
  if(!proj){console.log('');return;}
  await p.auctionProject.update({where:{id:proj.id},data:{status:'LIVE',startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+7*86400000)}});
  console.log(proj.id);
}).finally(()=>p.\$disconnect());
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  check_json "竞拍出价" "$BASE/api/m/auction/$PROJECT_ID/bid" "$USER_COOKIE" POST '{"amount":99999}'
else
  fail "无竞拍项目可测"
fi

echo "=== 晒场预约 ==="
LISTING_ID=$(npx tsx -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.dryingFieldListing.findFirst().then(l=>console.log(l?.id??'')).finally(()=>p.\$disconnect());
" 2>/dev/null | tail -1)
if [ -n "$LISTING_ID" ]; then
  resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-03\"}")
  echo "$resp" | grep -q '"ok"' && pass "晒场预约" || fail "晒场预约 ($resp)"
else
  fail "无晒场可测"
fi

echo "=== 第三方 SSO ==="
TOKEN=$(curl -s "$BASE/api/dev/third-party-token" | npx tsx -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))" 2>/dev/null)
if [ -n "$TOKEN" ]; then
  curl -s -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}" | grep -q '"ok"' && pass "第三方登录" || fail "第三方登录"
else
  fail "无法获取第三方 token"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ]
