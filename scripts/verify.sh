#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
README="${ROOT}/README.md"
if [[ ! -f "${README}" ]]; then
  echo "ERROR: README.md is missing at repository root." >&2
  exit 1
fi
if [[ ! -s "${README}" ]]; then
  echo "ERROR: README.md exists but is empty." >&2
  exit 1
fi
echo "OK: repository integrity checks passed."
