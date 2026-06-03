#!/bin/bash
set -euo pipefail
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name"
  fi
}

check_json() {
  local name="$1"
  local pattern="$2"
  local body="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (body: $body)"
    FAIL=$((FAIL + 1))
  fi
}

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

# --- Public pages ---
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# --- Auth: end user ---
RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -n 1)
check "POST /api/auth/login" 200 "$CODE"
check_json "login ok" '"ok":true' "$BODY"

# --- Auth: admin ---
RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -n 1)
check "POST /api/auth/admin/login" 200 "$CODE"
check_json "admin login ok" '"ok":true' "$BODY"

# --- Protected: admin dashboard ---
check "GET /admin (authenticated)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")"
check "GET /admin (unauthenticated redirect)" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

# --- Protected: mobile me ---
check "GET /m/me (authenticated)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/me")"

# --- Invalid login ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
CODE=$(echo "$RESP" | tail -n 1)
check "POST /api/auth/login wrong password" 401 "$CODE"

# --- Auction list page ---
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/auction")"

# --- Drying list ---
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/drying")"

# --- Dev third-party token ---
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?phone=13800138000")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -n 1)
check "GET /api/dev/third-party-token" 200 "$CODE"
check_json "third-party token" '"token"' "$BODY"

# --- Third-party SSO ---
TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -c /tmp/sso-cookies.txt -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  CODE=$(echo "$RESP" | tail -n 1)
  check "POST /api/auth/third-party" 200 "$CODE"
fi

# --- Admin assets API (POST only) ---
RESP=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" "$BASE/api/admin/assets")
CODE=$(echo "$RESP" | tail -n 1)
check "GET /api/admin/assets (405 expected)" 405 "$CODE"

# --- Bid without auth ---
PROJECT_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst().then(r => { console.log(r?.id ?? ''); p.\$disconnect(); });
" 2>/dev/null | tail -1)
if [ -n "$PROJECT_ID" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":10000}')
  CODE=$(echo "$RESP" | tail -n 1)
  check "POST bid unauthenticated" 401 "$CODE"

  check "GET /m/auction/$PROJECT_ID" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/auction/$PROJECT_ID")"
fi

# --- Logout ---
RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
CODE=$(echo "$RESP" | tail -n 1)
check "POST /api/auth/logout" 200 "$CODE"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All integration checks passed."
  exit 0
else
  echo "$FAIL check(s) failed."
  exit 1
fi
