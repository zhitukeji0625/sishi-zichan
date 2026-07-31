#!/usr/bin/env bash
set +e
BASE=http://localhost:3000
ADMIN_JAR=/tmp/sishi_admin_cookies.txt
USER_JAR=/tmp/sishi_user_cookies.txt
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== 页面 ==="
check "首页" 200 $(curl -s -o /dev/null -w "%{http_code}" $BASE/)
check "H5首页" 200 $(curl -s -o /dev/null -w "%{http_code}" $BASE/m)
check "管理登录页" 200 $(curl -s -o /dev/null -w "%{http_code}" $BASE/admin/login)
check "favicon" 200 $(curl -sL -o /dev/null -w "%{http_code}" $BASE/favicon.ico)
check "竞拍列表" 200 $(curl -s -o /dev/null -w "%{http_code}" $BASE/m/auction)
check "晒场列表" 200 $(curl -s -o /dev/null -w "%{http_code}" $BASE/m/drying)
check "管理后台(未登录重定向)" 307 $(curl -s -o /dev/null -w "%{http_code}" $BASE/admin)

echo "=== 鉴权 ==="
check "未登录出价401" 401 $(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/m/auction/fake/bid -H 'Content-Type: application/json' -d '{"amount":100}')
check "未登录预约401" 401 $(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/m/drying/reserve -H 'Content-Type: application/json' -d '{}')
check "未登录上传401" 401 $(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/upload)
check "admin未登录资产401" 401 $(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/admin/assets -H 'Content-Type: application/json' -d '{}')

echo "=== 登录 ==="
curl -s -c $ADMIN_JAR -X POST $BASE/api/auth/admin/login -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
check "admin登录" 200 $(curl -s -o /dev/null -w "%{http_code}" -b $ADMIN_JAR -X POST $BASE/api/auth/admin/login -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
curl -s -c $USER_JAR -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}' > /dev/null
check "user登录" 200 $(curl -s -o /dev/null -w "%{http_code}" -b $USER_JAR -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')

echo "=== multipart 校验 ==="
UPLOAD_CODE=$(curl -s -o /tmp/upload_resp.txt -w "%{http_code}" -b $ADMIN_JAR -X POST $BASE/api/upload -H 'Content-Type: application/json' -d '{}')
echo "  upload body: $(cat /tmp/upload_resp.txt)"
check "upload非multipart" 400 "$UPLOAD_CODE"
ASSET_CODE=$(curl -s -o /tmp/asset_resp.txt -w "%{http_code}" -b $ADMIN_JAR -X POST $BASE/api/admin/assets -H 'Content-Type: application/json' -d '{}')
echo "  asset body: $(cat /tmp/asset_resp.txt)"
check "admin assets非multipart" 400 "$ASSET_CODE"

echo "=== 第三方token ==="
check "third-party-token" 200 $(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")

echo "=== 竞拍出价 ==="
read -r PROJECT_ID MIN_BID <<< $(cd /workspace && npx tsx scripts/smoke-query.ts auction 2>/dev/null)
echo "  projectId=$PROJECT_ID minBid=$MIN_BID"
if [ -n "$PROJECT_ID" ] && [ -n "$MIN_BID" ]; then
  BID_RESP=$(curl -s -b $USER_JAR -X POST $BASE/api/m/auction/$PROJECT_ID/bid -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  echo "  bid: $BID_RESP"
  check "出价成功" "true" $(echo $BID_RESP | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('ok', False)).lower())" 2>/dev/null || echo false)
fi

echo "=== 晒场预约 ==="
read -r LISTING_ID <<< $(cd /workspace && npx tsx scripts/smoke-query.ts listing 2>/dev/null)
echo "  listingId=$LISTING_ID"
if [ -n "$LISTING_ID" ]; then
  OFFSET=$(( ($(date +%s) % 300) + 60 ))
  START=$(date -d "+${OFFSET} days" +%Y-%m-%d 2>/dev/null || date -v+${OFFSET}d +%Y-%m-%d)
  END=$(date -d "+$((OFFSET+2)) days" +%Y-%m-%d 2>/dev/null || date -v+$((OFFSET+2))d +%Y-%m-%d)
  RESERVE_RESP=$(curl -s -b $USER_JAR -X POST $BASE/api/m/drying/reserve -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  echo "  reserve: $RESERVE_RESP"
  check "晒场预约" "true" $(echo $RESERVE_RESP | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('ok', False)).lower())" 2>/dev/null || echo false)
  OVERLAP_RESP=$(curl -s -b $USER_JAR -X POST $BASE/api/m/drying/reserve -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  echo "  overlap: $OVERLAP_RESP"
  OVERLAP_OK=$(echo $OVERLAP_RESP | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if not d.get('ok') else 'false')" 2>/dev/null || echo false)
  check "重叠预约拒绝" "true" "$OVERLAP_OK"
fi

echo ""
echo "=== 结果: $PASS passed, $FAIL failed ==="
exit $FAIL
