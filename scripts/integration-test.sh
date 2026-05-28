#!/usr/bin/env bash
# 功能完整性冒烟测试（包装 npm script）
set -euo pipefail
cd "$(dirname "$0")/.."
export BASE_URL="${BASE_URL:-http://localhost:3000}"
exec npm run test:integration
