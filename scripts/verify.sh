#!/usr/bin/env bash
# 仓库基础完整性校验：在缺少应用代码时仍可作为 CI/本地冒烟测试入口。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

errors=0
fail() {
  echo "verify: FAIL — $*" >&2
  errors=$((errors + 1))
}

[[ -f README.md ]] || fail "缺少 README.md"
grep -q 'sishi-zichan' README.md || fail "README.md 应包含项目名称 sishi-zichan"

if [[ $errors -gt 0 ]]; then
  echo "verify: 共 ${errors} 项未通过" >&2
  exit 1
fi

echo "verify: 全部通过"
