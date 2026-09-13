#!/usr/bin/env bash
# Build + verify dual-hub test framework (forest-lan + infra3-standalone).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "========================================="
echo " Dual-hub test framework deploy"
echo "========================================="

"$ROOT/scripts/build.sh"

for profile in infra3-standalone forest-lan; do
  EXAMPLE="$ROOT/deploy/profiles/$profile/env.example"
  ENV_FILE="$ROOT/deploy/profiles/$profile/.env"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "==> Creating $ENV_FILE from example"
    cp "$EXAMPLE" "$ENV_FILE"
    echo "    EDIT $ENV_FILE (HA_LONG_LIVED_TOKEN for forest-lan) before fleet deploy"
  fi
done

echo ""
echo "==> Local verify (reachable hubs only)"
for profile in infra3-standalone forest-lan; do
  ENV_FILE="$ROOT/deploy/profiles/$profile/.env"
  echo "--- $profile ---"
  if ENV_FILE="$ENV_FILE" "$ROOT/scripts/verify-hub.sh"; then
    echo "OK $profile"
  else
    echo "SKIP $profile — hub not reachable from this host (deploy via @redhat-agent)"
  fi
  echo ""
done

echo "Fleet deploy (when workstation SSH blocked):"
echo "  @redhat-agent → deploy-profile.sh infra3-standalone on 172.16.1.36"
echo "  @redhat-agent → deploy-profile.sh forest-lan on 172.16.255.250"
echo ""
echo "TV app: rebuild guest-launcher APK or use claim UI with both profiles."
echo "Docs: docs/TEST-FRAMEWORK.md"
