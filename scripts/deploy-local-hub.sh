#!/usr/bin/env bash
# Install tv-hub quadlet on the local machine (infra3 / workstation with podman).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/deploy-env.sh
source "$ROOT/scripts/lib/deploy-env.sh"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/profiles/infra3-standalone/.env}"

[[ -f "$ENV_FILE" ]] || ENV_FILE="$ROOT/deploy/.env"
[[ -f "$ENV_FILE" ]] || { echo "ERROR: set ENV_FILE to a profile .env" >&2; exit 1; }

# shellcheck disable=SC1090
source "$ENV_FILE"

deploy_env_sync_urls_from_file "$ENV_FILE" || : "${HUB_PUBLIC_URL:?Set HUB_PUBLIC_URL or HUB_HOST+HUB_LISTEN_PORT}"
: "${HUB_LISTEN_PORT:?Set HUB_LISTEN_PORT in $ENV_FILE}"
IMAGE="${ADB_TV_HUB_IMAGE:-localhost/aatomhome-tv-hub:latest}"
PROFILE="${DEPLOY_PROFILE:-infra3-standalone}"
QUADLET_DIR="$ROOT/deploy/profiles/$PROFILE"
[[ -d "$QUADLET_DIR" ]] || QUADLET_DIR="$ROOT/deploy/forest-home"

echo "==> Local hub install (profile: $PROFILE)"

ENV_FILE="$ENV_FILE" "$ROOT/scripts/fetch-upstream.sh"
ENV_FILE="$ENV_FILE" "$ROOT/scripts/build.sh"

PODMAN_MODE="${PODMAN_MODE:-rootless}"
ENV_TMP="$(mktemp)"
deploy_env_write_runtime "$ENV_TMP"

if [[ "$PODMAN_MODE" == "rootful" ]]; then
  TARGET="/etc/containers/systemd"
  sudo mkdir -p "$TARGET"
  sudo cp "$QUADLET_DIR/adb-tv-hub.container" "$QUADLET_DIR/adb-tv-hub-data.volume" "$TARGET/"
  sudo cp "$ENV_TMP" "$TARGET/adb-tv-hub.env"
  sudo sed -i "s|^Image=.*|Image=$IMAGE|" "$TARGET/adb-tv-hub.container"
  sudo systemctl daemon-reload
  sudo systemctl enable --now adb-tv-hub.service
else
  TARGET="${HOME}/.config/containers/systemd"
  mkdir -p "$TARGET"
  cp "$QUADLET_DIR/adb-tv-hub.container" "$QUADLET_DIR/adb-tv-hub-data.volume" "$TARGET/"
  cp "$ENV_TMP" "$TARGET/adb-tv-hub.env"
  sed -i "s|^Image=.*|Image=$IMAGE|" "$TARGET/adb-tv-hub.container"
  loginctl enable-linger "$(whoami)" 2>/dev/null || true
  systemctl --user daemon-reload
  systemctl --user enable --now adb-tv-hub.service
fi
rm -f "$ENV_TMP"

if [[ -n "${HA_HOST:-}" ]]; then
  ENV_FILE="$ENV_FILE" "$ROOT/scripts/install-ha-integration.sh"
fi

ENV_FILE="$ENV_FILE" "$ROOT/scripts/verify-hub.sh"
echo "==> Local hub OK: $HUB_PUBLIC_URL"
