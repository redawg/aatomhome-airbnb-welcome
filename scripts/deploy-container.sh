#!/usr/bin/env bash
# Deploy tv-hub container via Podman quadlets — local host or remote SSH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/deploy-env.sh
source "$ROOT/scripts/lib/deploy-env.sh"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/profiles/container/.env}"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — run: ./scripts/configure-deploy.sh --type container --force"

# shellcheck disable=SC1090
source "$ENV_FILE"

deploy_env_sync_urls_from_file "$ENV_FILE" || true
: "${HUB_PUBLIC_URL:?Set HUB_PUBLIC_URL or HUB_HOST+HUB_LISTEN_PORT}"
: "${HUB_LISTEN_PORT:?Set HUB_LISTEN_PORT}"
: "${HUB_GUEST_URL:?Set HUB_GUEST_URL}"

MODE="${CONTAINER_DEPLOY_MODE:-local}"
IMAGE="${ADB_TV_HUB_IMAGE:-localhost/aatomhome-tv-hub:latest}"
PODMAN_MODE="${PODMAN_MODE:-rootless}"
QUADLET_SRC="$(deploy_env_quadlet_dir "$ROOT" container)"

echo "========================================="
echo " tv-hub container deploy ($MODE)"
echo "========================================="
echo " Hub:   $HUB_PUBLIC_URL"
echo " Mode:  $MODE"
echo ""

export ENV_FILE
"$ROOT/scripts/fetch-upstream.sh"

APK_SRC="${GUEST_LAUNCHER_APK:-$ROOT/guest-launcher/releases/aatomhome-guest-welcome.apk}"
[[ "$APK_SRC" != /* ]] && APK_SRC="$ROOT/$APK_SRC"
APK_DEST="$ROOT/tv-hub/guest-launcher/aatomhome-guest-welcome.apk"
mkdir -p "$(dirname "$APK_DEST")"
if [[ "${PATCH_APK_HUB_URL:-1}" == "1" ]]; then
  "$ROOT/scripts/patch-apk-hub-url.sh"
fi
cp "$APK_SRC" "$APK_DEST"

ENV_TMP="$(mktemp)"
deploy_env_write_runtime "$ENV_TMP"

if [[ "$MODE" == "remote" ]]; then
  : "${DEPLOY_HOST:?Set DEPLOY_HOST for remote container deploy}"
  HA_USER="${DEPLOY_USER:-root}"
  HA_SSH_OPTS="${HA_SSH_OPTS:--o StrictHostKeyChecking=no -o ConnectTimeout=15}"
  SSH=(ssh $HA_SSH_OPTS "${HA_USER}@${DEPLOY_HOST}")
  RSYNC_SSH="ssh $HA_SSH_OPTS"
  REMOTE_BUILD="${REMOTE_BUILD:-1}"
  REMOTE_DIR="${REMOTE_BUILD_DIR:-/opt/aatomhome-airbnb-welcome-build}"

  "${SSH[@]}" "echo OK: SSH to ${DEPLOY_HOST}" || die "Cannot SSH to ${HA_USER}@${DEPLOY_HOST}"

  if [[ "$REMOTE_BUILD" == "1" ]]; then
    "${SSH[@]}" "mkdir -p ${REMOTE_DIR}"
    rsync -az --delete -e "$RSYNC_SSH" --exclude '.git' \
      "$ROOT/tv-hub/" "${HA_USER}@${DEPLOY_HOST}:${REMOTE_DIR}/tv-hub/"
    "${SSH[@]}" "cd ${REMOTE_DIR}/tv-hub && podman build -t ${IMAGE} -f Containerfile ."
  else
    podman build -t "$IMAGE" -f "$ROOT/tv-hub/Containerfile" "$ROOT/tv-hub"
  fi

  if [[ "$PODMAN_MODE" == "rootful" ]]; then
    QUADLET_TARGET="/etc/containers/systemd"
    "${SSH[@]}" "mkdir -p ${QUADLET_TARGET}"
    rsync -az -e "$RSYNC_SSH" "$QUADLET_SRC/adb-tv-hub.container" "$QUADLET_SRC/adb-tv-hub-data.volume" \
      "${HA_USER}@${DEPLOY_HOST}:${QUADLET_TARGET}/"
    rsync -az -e "$RSYNC_SSH" "$ENV_TMP" "${HA_USER}@${DEPLOY_HOST}:${QUADLET_TARGET}/adb-tv-hub.env"
    "${SSH[@]}" "sed -i 's|^Image=.*|Image=${IMAGE}|' ${QUADLET_TARGET}/adb-tv-hub.container"
    "${SSH[@]}" "systemctl daemon-reload && systemctl enable --now adb-tv-hub.service"
  else
    QUADLET_TARGET="/home/${HA_USER}/.config/containers/systemd"
    "${SSH[@]}" "mkdir -p ${QUADLET_TARGET}"
    rsync -az -e "$RSYNC_SSH" "$QUADLET_SRC/adb-tv-hub.container" "$QUADLET_SRC/adb-tv-hub-data.volume" \
      "${HA_USER}@${DEPLOY_HOST}:${QUADLET_TARGET}/"
    rsync -az -e "$RSYNC_SSH" "$ENV_TMP" "${HA_USER}@${DEPLOY_HOST}:${QUADLET_TARGET}/adb-tv-hub.env"
    "${SSH[@]}" "sed -i 's|^Image=.*|Image=${IMAGE}|' ${QUADLET_TARGET}/adb-tv-hub.container"
    "${SSH[@]}" "loginctl enable-linger ${HA_USER} 2>/dev/null || true"
    "${SSH[@]}" "systemctl --user daemon-reload && systemctl --user enable --now adb-tv-hub.service"
  fi
else
  ENV_FILE="$ENV_FILE" "$ROOT/scripts/build.sh"
  TARGET="${HOME}/.config/containers/systemd"
  if [[ "$PODMAN_MODE" == "rootful" ]]; then
    TARGET="/etc/containers/systemd"
    sudo mkdir -p "$TARGET"
    sudo cp "$QUADLET_SRC/adb-tv-hub.container" "$QUADLET_SRC/adb-tv-hub-data.volume" "$TARGET/"
    sudo cp "$ENV_TMP" "$TARGET/adb-tv-hub.env"
    sudo sed -i "s|^Image=.*|Image=$IMAGE|" "$TARGET/adb-tv-hub.container"
    sudo systemctl daemon-reload
    sudo systemctl enable --now adb-tv-hub.service
  else
    mkdir -p "$TARGET"
    cp "$QUADLET_SRC/adb-tv-hub.container" "$QUADLET_SRC/adb-tv-hub-data.volume" "$TARGET/"
    cp "$ENV_TMP" "$TARGET/adb-tv-hub.env"
    sed -i "s|^Image=.*|Image=$IMAGE|" "$TARGET/adb-tv-hub.container"
    loginctl enable-linger "$(whoami)" 2>/dev/null || true
    systemctl --user daemon-reload
    systemctl --user enable --now adb-tv-hub.service
  fi
fi

rm -f "$ENV_TMP"
sleep 3
ENV_FILE="$ENV_FILE" "$ROOT/scripts/verify-hub.sh" || echo "WARN: health check failed — inspect adb-tv-hub.service logs"

if [[ -n "${HA_HOST:-}" || ( -n "${HA_CONFIG_DIR:-}" && -d "${HA_CONFIG_DIR:-}" ) ]]; then
  ENV_FILE="$ENV_FILE" "$ROOT/scripts/install-ha-integration.sh"
fi

echo ""
echo "Deploy complete: $HUB_PUBLIC_URL"
echo "HA UI: add integration → Aatomhome Airbnb Welcome → hub URL $HUB_PUBLIC_URL"
