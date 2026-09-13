#!/usr/bin/env bash
# Copy aatomhome_airbnb_welcome integration to HA config (local path or SSH).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/homeassistant/custom_components/aatomhome_airbnb_welcome"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/forest-home/.env}"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -d "$SRC" ]] || die "Integration source missing: $SRC"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

HA_HOST="${HA_HOST:-}"
HA_USER="${HA_USER:-root}"
HA_SSH_OPTS="${HA_SSH_OPTS:--o StrictHostKeyChecking=no -o ConnectTimeout=15}"
HA_CONFIG_DIR="${HA_CONFIG_DIR:-/config}"
DEST_NAME="aatomhome_airbnb_welcome"

if [[ -n "$HA_HOST" ]]; then
  REMOTE="${HA_USER}@${HA_HOST}:${HA_CONFIG_DIR}/custom_components/${DEST_NAME}/"
  echo "==> Installing HA integration via SSH → $REMOTE"
  ssh $HA_SSH_OPTS "${HA_USER}@${HA_HOST}" "mkdir -p ${HA_CONFIG_DIR}/custom_components/${DEST_NAME}"
  rsync -az --delete -e "ssh $HA_SSH_OPTS" \
    "$SRC/" "$REMOTE"
else
  LOCAL_DEST="${HA_CONFIG_DIR}/custom_components/${DEST_NAME}"
  [[ -d "$HA_CONFIG_DIR" ]] || die "HA_CONFIG_DIR not found: $HA_CONFIG_DIR (set HA_HOST for remote)"
  mkdir -p "$LOCAL_DEST"
  rsync -a --delete "$SRC/" "$LOCAL_DEST/"
  echo "==> HA integration copied to $LOCAL_DEST"
fi
