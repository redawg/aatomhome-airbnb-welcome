#!/usr/bin/env bash
# Install HA custom integration (manual path — prefer HACS; see docs/HACS.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/profiles/homeassistant/.env}"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — run: ./scripts/configure-deploy.sh --type homeassistant --force"

# shellcheck disable=SC1090
source "$ENV_FILE"

echo "========================================="
echo " Home Assistant integration install"
echo "========================================="
echo " Hub URL (for UI): ${HUB_PUBLIC_URL:-set in HA config flow}"
echo ""

ENV_FILE="$ENV_FILE" "$ROOT/scripts/install-ha-integration.sh"

if [[ "${HA_RESTART_AFTER_INTEGRATION:-1}" == "1" && -n "${HA_HOST:-}" ]]; then
  HA_USER="${HA_USER:-root}"
  HA_SSH_OPTS="${HA_SSH_OPTS:--o StrictHostKeyChecking=no -o ConnectTimeout=15}"
  if ssh $HA_SSH_OPTS "${HA_USER}@${HA_HOST}" "command -v ha >/dev/null 2>&1"; then
    ssh $HA_SSH_OPTS "${HA_USER}@${HA_HOST}" "ha core restart" || echo "WARN: ha core restart failed"
  fi
fi

echo ""
echo "Next: HA → Settings → Devices & services → Add integration"
echo "      → Aatomhome Airbnb Welcome → ${HUB_PUBLIC_URL:-your tv-hub URL}"
echo ""
echo "Or install via HACS: docs/HACS.md"
