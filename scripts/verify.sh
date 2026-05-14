#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

errors=0

check_file() {
  local path="$1"
  local desc="${2:-$path}"
  if [[ ! -f "$path" ]]; then
    echo "ERROR: missing $desc ($path)" >&2
    errors=$((errors + 1))
    return
  fi
  if [[ ! -s "$path" ]]; then
    echo "ERROR: empty $desc ($path)" >&2
    errors=$((errors + 1))
  fi
}

check_file "README.md" "project readme"

if [[ "$errors" -ne 0 ]]; then
  echo "verify.sh: $errors check(s) failed" >&2
  exit 1
fi

echo "OK: repository integrity checks passed"
