#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_COOKIE_JAR=$(mktemp)
FAILURES=0

check() {
  local name="$1" url="$2" expected="${3:-200}" extra_args="${4:-}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $extra_args "$url" || echo "000")
  if [[ "$code" == "$expected" ]]; then
    echo "OK  $name ($code)"
  else
    echo "FAIL $name expected=$expected got=$code url=$url"
    FAILURES=$((FAILURES + 1))
  fi
}

check_post_json() {
  local name="$1" url="$2" body="$3" expected="${4:-200}" jar="${5:-}"
  local args=(-s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$body")
  if [[ -n "$jar" ]]; then args+=(-c "$jar" -b "$jar"); fi
  local code
  code=$(curl "${args[@]}" "$url" || echo "000")
  if [[ "$code" == "$expected" ]]; then
    echo "OK  $name ($code)"
  else
    echo "FAIL $name expected=$expected got=$code url=$url"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "=== Public pages ==="
check "home" "$BASE/"
check "m home" "$BASE/m"
check "m login" "$BASE/m/login"
check "m register" "$BASE/m/register"
check "m auction list" "$BASE/m/auction"
check "m drying" "$BASE/m/drying"
check "admin login" "$BASE/admin/login"

echo "=== User auth ==="
check_post_json "user login" "$BASE/api/auth/login" \
  '{"phone":"13800138000","password":"user123"}' 200 "$COOKIE_JAR"

echo "=== Authenticated mobile pages ==="
check "m me" "$BASE/m/me" 200 "-b $COOKIE_JAR"
check "m orders" "$BASE/m/orders" 200 "-b $COOKIE_JAR"

echo "=== Admin auth ==="
check_post_json "admin login" "$BASE/api/auth/admin/login" \
  '{"phone":"13900000001","password":"admin123"}' 200 "$ADMIN_COOKIE_JAR"

echo "=== Admin pages ==="
for path in /admin /admin/assets /admin/auctions /admin/drying /admin/registrations \
  /admin/announcements /admin/organizations /admin/admins /admin/dict /admin/config /admin/audit; do
  check "admin $path" "$BASE$path" 200 "-b $ADMIN_COOKIE_JAR"
done

echo "=== Third-party SSO ==="
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=sso-test-user" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
if [[ -n "$TOKEN" && "$TOKEN" != "None" ]]; then
  check "sso page" "$BASE/m/sso?token=$TOKEN" 200
else
  echo "FAIL third-party token"
  FAILURES=$((FAILURES + 1))
fi

echo "=== Auction bid API ==="
# Get a live auction project id from auction page or use seed data
PROJECT_ID=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction" | grep -oP '/m/auction/\K[a-z0-9]+' | head -1 || echo "")
if [[ -n "$PROJECT_ID" ]]; then
  check "auction detail" "$BASE/m/auction/$PROJECT_ID" 200 "-b $COOKIE_JAR"
  # Try bid - may fail if already highest bidder, but should not 500
  code=$(curl -s -o /tmp/bid_resp.json -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" -b "$COOKIE_JAR" \
    -d '{"amount":"999999"}' "$BASE/api/m/auction/$PROJECT_ID/bid" || echo "000")
  if [[ "$code" == "200" || "$code" == "400" || "$code" == "409" ]]; then
    echo "OK  bid API ($code)"
  else
    echo "FAIL bid API expected 200/400/409 got=$code body=$(cat /tmp/bid_resp.json)"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "WARN no live auction found on /m/auction"
fi

echo "=== Drying reserve API ==="
DRYING_ID=$(curl -s -b "$COOKIE_JAR" "$BASE/m/drying" | grep -oP '/m/drying/\K[a-z0-9]+' | head -1 || echo "")
if [[ -n "$DRYING_ID" ]]; then
  check "drying detail" "$BASE/m/drying/$DRYING_ID" 200 "-b $COOKIE_JAR"
  code=$(curl -s -o /tmp/dry_resp.json -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" -b "$COOKIE_JAR" \
    -d '{"slotId":"invalid"}' "$BASE/api/m/drying/reserve" || echo "000")
  if [[ "$code" == "200" || "$code" == "400" || "$code" == "409" ]]; then
    echo "OK  drying reserve API ($code)"
  else
    echo "FAIL drying reserve API got=$code body=$(cat /tmp/dry_resp.json)"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "WARN no drying session found"
fi

echo "=== Upload API (invalid multipart) ==="
code=$(curl -s -o /tmp/upload_resp.json -w "%{http_code}" -X POST \
  -H "Content-Type: multipart/form-data" -b "$ADMIN_COOKIE_JAR" \
  --data-binary "not-multipart" "$BASE/api/upload" || echo "000")
if [[ "$code" == "400" ]]; then
  echo "OK  upload invalid multipart (400)"
else
  echo "FAIL upload invalid multipart expected=400 got=$code body=$(cat /tmp/upload_resp.json)"
  FAILURES=$((FAILURES + 1))
fi

rm -f "$COOKIE_JAR" "$ADMIN_COOKIE_JAR"
echo "=== Done: $FAILURES failure(s) ==="
exit $FAILURES
