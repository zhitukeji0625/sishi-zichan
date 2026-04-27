#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

test -f README.md
grep -q '[^[:space:]]' README.md

echo "smoke: README present and non-empty — ok"
