#!/usr/bin/env bash
set -euo pipefail

# Prefer non-root docker; fall back to sudo when the socket is root-only (e.g. freshly started dockerd).
docker_cli() {
  if docker info &>/dev/null; then
    docker "$@"
  elif sudo docker info &>/dev/null; then
    sudo docker "$@"
  else
    echo "Docker is not available or not reachable. Start the daemon or grant socket access." >&2
    exit 1
  fi
}

compose() {
  docker_cli compose "$@"
}

compose up -d mysql

i=0
until compose exec -T mysql healthcheck.sh --connect --innodb_initialized 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 40 ]; then
    echo "mysql not ready" >&2
    exit 1
  fi
  sleep 2
done

export DATABASE_URL="${DATABASE_URL:-mysql://root:root@127.0.0.1:3307/sishi}"
npx prisma db push
npm test
