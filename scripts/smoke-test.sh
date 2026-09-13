#!/usr/bin/env bash
# API 冒烟测试 — 须在 dev 模式 (npm run dev) 下运行
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}"
ADMIN_COOKIE="$TMPDIR/smoke_admin_cookies.txt"
USER_COOKIE="$TMPDIR/smoke_user_cookies.txt"
rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test against $BASE ==="

# --- 页面 ---
check "homepage" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "admin login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "mobile login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "mobile auction page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"

# --- 认证 ---
check "admin login missing params" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{}')"
check "admin login wrong pwd" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"wrong"}')"

ADMIN_RESP=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
check "admin login success" "true" "$(echo "$ADMIN_RESP" | python3 -c 'import sys,json; print(str(json.load(sys.stdin).get("ok", False)).lower())' 2>/dev/null || echo false)"

USER_RESP=$(curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
check "user login success" "true" "$(echo "$USER_RESP" | python3 -c 'import sys,json; print(str(json.load(sys.stdin).get("ok", False)).lower())' 2>/dev/null || echo false)"

# --- 上传/资产 multipart 校验 ---
check "upload no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")"
check "upload non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"
check "admin assets non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')"

# --- 注册 ---
check "register invalid" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"phone":"123"}')"
PHONE="199$(date +%s | tail -c 9)"
REG_RESP=$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟用户\"}")
check "register success" "true" "$(echo "$REG_RESP" | python3 -c 'import sys,json; print(str(json.load(sys.stdin).get("ok", False)).lower())' 2>/dev/null || echo false)"

# --- 出价 ---
check "bid no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"

# 从 DB 查 LIVE 项目并计算最低出价
BID_INFO=$(cd "$(dirname "$0")/.." && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
const project = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
if (!project) { console.log('NONE'); await p.\$disconnect(); process.exit(0); }
const top = await p.auctionBid.findFirst({ where: { projectId: project.id }, orderBy: { amount: 'desc' } });
const minBid = top
  ? new Decimal(top.amount.toString()).plus(project.bidStep.toString()).toNumber()
  : Number(project.startPrice.toString());
console.log(project.id + ' ' + minBid);
await p.\$disconnect();
" 2>/dev/null)

if [ "$BID_INFO" = "NONE" ] || [ -z "$BID_INFO" ]; then
  echo "FAIL: no LIVE auction project found"
  FAIL=$((FAIL + 1))
else
  PROJECT_ID=$(echo "$BID_INFO" | awk '{print $1}')
  MIN_BID=$(echo "$BID_INFO" | awk '{print $2}')
  BID_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  check "bid success" "true" "$(echo "$BID_RESP" | python3 -c 'import sys,json; print(str(json.load(sys.stdin).get("ok", False)).lower())' 2>/dev/null || echo false)"
fi

# --- 晒场预约 ---
check "drying reserve no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d '{}')"

LISTING_ID=$(cd "$(dirname "$0")/.." && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
console.log(l?.id ?? 'NONE');
await p.\$disconnect();
" 2>/dev/null)

if [ "$LISTING_ID" = "NONE" ] || [ -z "$LISTING_ID" ]; then
  echo "FAIL: no OPERATING drying listing found"
  FAIL=$((FAIL + 1))
else
  START=$(date -d '+3 days' +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d '+4 days' +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  DRY_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check "drying reserve success" "true" "$(echo "$DRY_RESP" | python3 -c 'import sys,json; print(str(json.load(sys.stdin).get("ok", False)).lower())' 2>/dev/null || echo false)"
fi

echo "---"
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
