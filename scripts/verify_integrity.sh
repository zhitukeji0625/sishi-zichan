#!/usr/bin/env bash
# Repository baseline checks. Extend this script as application code and tests are added.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

errors=0

fail() {
  echo "error: $*" >&2
  errors=$((errors + 1))
}

if [[ ! -f README.md ]]; then
  fail "README.md is missing"
else
  if [[ ! -s README.md ]]; then
    fail "README.md is empty"
  fi
fi

if [[ $errors -gt 0 ]]; then
  echo "verify_integrity: $errors check(s) failed" >&2
  exit 1
fi

echo "verify_integrity: all checks passed"
