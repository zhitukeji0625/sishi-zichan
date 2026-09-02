#!/usr/bin/env bash
# 冒烟测试：验证核心页面、登录、字典、竞拍出价、上传校验、第三方 token
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name expected=$expect got=$actual"
    FAIL=$((FAIL + 1))
  fi
}

# 页面可达
for path in "/" "/admin/login" "/m" "/m/login" "/m/auction" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# 管理员登录
ADMIN_RESP=$(curl -s -c /tmp/smoke_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_OK=$(echo "$ADMIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo false)
check "Admin login" "True" "$ADMIN_OK"

# 用户登录
USER_RESP=$(curl -s -c /tmp/smoke_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_OK=$(echo "$USER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo false)
check "User login" "True" "$USER_OK"

# 管理后台页面
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/dict" "/admin/organizations"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt "$BASE$path")
  check "GET $path" "200" "$code"
done

# 字典数据
DICT_COUNT=$(npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.dictCategory.count().then(c=>{console.log(c);p.\$disconnect()})" 2>/dev/null)
if [ "${DICT_COUNT:-0}" -ge 14 ]; then
  echo "✓ Dict categories ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "✗ Dict categories expected>=14 got=${DICT_COUNT:-0}"
  FAIL=$((FAIL + 1))
fi

# 第三方 token
TP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
check "Third party token" "200" "$TP_CODE"

# 上传校验
UPLOAD_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check "Upload no auth" "401" "$UPLOAD_NOAUTH"

UPLOAD_JSON=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
check "Upload non-multipart" "400" "$UPLOAD_JSON"

# 触发演示竞拍恢复（访问首页）
curl -s -o /dev/null "$BASE/"

# 竞拍出价
PROJECT=$(npx tsx -e "
import{PrismaClient}from'@prisma/client';
const p=new PrismaClient();
async function main(){
  const proj=await p.auctionProject.findFirst({include:{bids:{orderBy:{amount:'desc'},take:1}}});
  if(!proj){console.log('NONE');return;}
  const top=proj.bids[0]?.amount?Number(proj.bids[0].amount):Number(proj.startPrice);
  const min=top+Number(proj.bidStep);
  console.log(proj.id+'|'+proj.status+'|'+min);
}
main().finally(()=>p.\$disconnect());
" 2>/dev/null)

PROJECT_ID=$(echo "$PROJECT" | cut -d'|' -f1)
PROJECT_STATUS=$(echo "$PROJECT" | cut -d'|' -f2)
MIN_BID=$(echo "$PROJECT" | cut -d'|' -f3)

if [ "$PROJECT_STATUS" = "LIVE" ] && [ "$PROJECT_ID" != "NONE" ]; then
  BID_RESP=$(curl -s -b /tmp/smoke_user.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  BID_OK=$(echo "$BID_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo false)
  check "Auction bid ($MIN_BID)" "True" "$BID_OK"
else
  echo "✗ Auction status expected=LIVE got=$PROJECT_STATUS"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
