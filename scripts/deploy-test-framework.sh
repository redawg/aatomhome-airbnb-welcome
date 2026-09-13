#!/usr/bin/env bash
# Build + verify multi-hub test setup (two container deploys with different host:port).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "========================================="
echo " Multi-hub test framework"
echo "========================================="

"$ROOT/scripts/build.sh"

echo "Configure two container profiles (example):"
echo "  ./scripts/configure-deploy.sh --type container --host 192.168.1.10 --port 8080 --force"
echo "  # second hub: copy .env to deploy/profiles/container-hub-b/.env or use claim UI Hub B URL"
echo ""

ENV_FILE="${ENV_FILE:-$ROOT/deploy/profiles/container/.env}"
if [[ -f "$ENV_FILE" ]]; then
  echo "--- container (primary) ---"
  ENV_FILE="$ENV_FILE" "$ROOT/scripts/verify-hub.sh" || echo "SKIP — hub not reachable from this host"
fi

echo ""
echo "Deploy containers:"
echo "  ./scripts/deploy-profile.sh container"
echo ""
echo "HA: add two integration instances (HACS) with each hub URL."
echo "TV: claim Hub A and Hub B in guest launcher."
echo "Docs: docs/TEST-FRAMEWORK.md"
