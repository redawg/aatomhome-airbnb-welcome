#!/usr/bin/env bash
# Health-check tv-hub after deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/forest-home/.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

HUB_PUBLIC_URL="${HUB_PUBLIC_URL:-http://127.0.0.1:8080}"
HUB_PUBLIC_URL="${HUB_PUBLIC_URL%/}"

echo "==> Health: $HUB_PUBLIC_URL/api/health"
health="$(curl -sf --connect-timeout 10 "$HUB_PUBLIC_URL/api/health")" || {
  echo "FAIL: hub not reachable at $HUB_PUBLIC_URL" >&2
  exit 1
}
echo "$health" | python3 -m json.tool

echo ""
echo "==> Registry: $HUB_PUBLIC_URL/api/registry"
registry="$(curl -sf --connect-timeout 10 "$HUB_PUBLIC_URL/api/registry")"
echo "$registry" | python3 -m json.tool

code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 10 "$HUB_PUBLIC_URL/guest/")"
echo ""
echo "==> Guest page HTTP $code ($HUB_PUBLIC_URL/guest/)"
[[ "$code" == "200" ]] || exit 1

echo ""
echo "==> Extensions: $HUB_PUBLIC_URL/api/aatomhome/health"
ext="$(curl -sf --connect-timeout 10 "$HUB_PUBLIC_URL/api/aatomhome/health")" || {
  echo "FAIL: aatomhome extensions not loaded" >&2
  exit 1
}
echo "$ext" | python3 -m json.tool

echo "OK"
