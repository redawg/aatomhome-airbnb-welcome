#!/usr/bin/env bash
# Deploy tv-hub + HA integration to Forest Home (172.16.255.250).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/profiles/forest-lan/.env}"
[[ -f "$ENV_FILE" ]] || ENV_FILE="$ROOT/deploy/forest-home/.env"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — cp deploy/forest-home/env.example deploy/forest-home/.env"

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${HUB_PUBLIC_URL:?Set HUB_PUBLIC_URL}"
: "${HUB_GUEST_URL:?Set HUB_GUEST_URL}"
: "${HA_HOST:?Set HA_HOST for remote deploy}"

HA_USER="${HA_USER:-root}"
HA_SSH_OPTS="${HA_SSH_OPTS:--o StrictHostKeyChecking=no -o ConnectTimeout=15}"
SSH=(ssh $HA_SSH_OPTS "${HA_USER}@${HA_HOST}")
RSYNC_SSH="ssh $HA_SSH_OPTS"
IMAGE="${ADB_TV_HUB_IMAGE:-localhost/aatomhome-tv-hub:latest}"
PODMAN_MODE="${PODMAN_MODE:-rootful}"
REMOTE_BUILD="${REMOTE_BUILD:-1}"
REMOTE_DIR="${REMOTE_BUILD_DIR:-/root/aatomhome-airbnb-welcome-build}"
QUADLET_SRC="$ROOT/deploy/profiles/forest-lan"
[[ -d "$QUADLET_SRC" ]] || QUADLET_SRC="$ROOT/deploy/forest-home"

echo "========================================="
echo " Forest Home tv-hub deploy"
echo "========================================="
echo " Host:  ${HA_USER}@${HA_HOST}"
echo " Hub:   $HUB_PUBLIC_URL"
echo " HA:    ${HA_URL:-http://127.0.0.1:8123}"
echo ""

"${SSH[@]}" "echo OK: SSH to ${HA_HOST}" || die "Cannot SSH to ${HA_USER}@${HA_HOST}"

export ENV_FILE
"${ROOT}/scripts/fetch-upstream.sh"

APK_SRC="${GUEST_LAUNCHER_APK:-$ROOT/guest-launcher/releases/aatomhome-guest-welcome.apk}"
[[ "$APK_SRC" != /* ]] && APK_SRC="$ROOT/$APK_SRC"
APK_DEST="$ROOT/tv-hub/guest-launcher/cielodeloro-guestwelcome.apk"
mkdir -p "$(dirname "$APK_DEST")"

if [[ "${PATCH_APK_HUB_URL:-1}" == "1" ]]; then
  "${ROOT}/scripts/patch-apk-hub-url.sh"
fi
cp "$APK_SRC" "$APK_DEST"
echo "==> Guest launcher APK staged for container build"

if [[ "$REMOTE_BUILD" == "1" ]]; then
  echo "==> Syncing build context to ${HA_HOST}:${REMOTE_DIR}"
  "${SSH[@]}" "mkdir -p ${REMOTE_DIR}"
  rsync -az --delete -e "$RSYNC_SSH" \
    --exclude '.git' \
    "$ROOT/tv-hub/" "${HA_USER}@${HA_HOST}:${REMOTE_DIR}/tv-hub/"
  echo "==> Building $IMAGE on ${HA_HOST}"
  "${SSH[@]}" "cd ${REMOTE_DIR}/tv-hub && podman build -t ${IMAGE} -f Containerfile ."
else
  echo "==> Building $IMAGE locally"
  podman build -t "$IMAGE" -f "$ROOT/tv-hub/Containerfile" "$ROOT/tv-hub"
  echo "==> (LOCAL_BUILD) Image built locally — set REMOTE_BUILD=1 to build on Forest host"
fi

echo "==> Installing Podman quadlets (${PODMAN_MODE})"
ENV_TMP="$(mktemp)"
cat > "$ENV_TMP" <<EOF
HUB_PUBLIC_URL=${HUB_PUBLIC_URL}
TEMPEST_API_TOKEN=${TEMPEST_API_TOKEN:-}
TEMPEST_STATION_ID=${TEMPEST_STATION_ID:-}
HA_URL=${HA_URL:-http://127.0.0.1:8123}
HA_LONG_LIVED_TOKEN=${HA_LONG_LIVED_TOKEN:-}
EOF

if [[ "$PODMAN_MODE" == "rootful" ]]; then
  QUADLET_TARGET="/etc/containers/systemd"
  "${SSH[@]}" "mkdir -p ${QUADLET_TARGET}"
  rsync -az -e "$RSYNC_SSH" \
    "$QUADLET_SRC/adb-tv-hub.container" \
    "$QUADLET_SRC/adb-tv-hub-data.volume" \
    "${HA_USER}@${HA_HOST}:${QUADLET_TARGET}/"
  rsync -az -e "$RSYNC_SSH" "$ENV_TMP" "${HA_USER}@${HA_HOST}:${QUADLET_TARGET}/adb-tv-hub.env"
  "${SSH[@]}" "sed -i 's|^Image=.*|Image=${IMAGE}|' ${QUADLET_TARGET}/adb-tv-hub.container"
  "${SSH[@]}" "systemctl daemon-reload && systemctl enable --now adb-tv-hub.service"
else
  QUADLET_TARGET="/home/${HA_USER}/.config/containers/systemd"
  "${SSH[@]}" "mkdir -p ${QUADLET_TARGET}"
  rsync -az -e "$RSYNC_SSH" \
    "$QUADLET_SRC/adb-tv-hub.container" \
    "$QUADLET_SRC/adb-tv-hub-data.volume" \
    "${HA_USER}@${HA_HOST}:${QUADLET_TARGET}/"
  rsync -az -e "$RSYNC_SSH" "$ENV_TMP" "${HA_USER}@${HA_HOST}:${QUADLET_TARGET}/adb-tv-hub.env"
  "${SSH[@]}" "sed -i 's|^Image=.*|Image=${IMAGE}|' ${QUADLET_TARGET}/adb-tv-hub.container"
  "${SSH[@]}" "loginctl enable-linger ${HA_USER} 2>/dev/null || true"
  "${SSH[@]}" "systemctl --user daemon-reload && systemctl --user enable --now adb-tv-hub.service"
fi
rm -f "$ENV_TMP"

echo "==> Waiting for hub health"
sleep 5
ENV_FILE="$ENV_FILE" "${ROOT}/scripts/verify-hub.sh" || {
  echo "WARN: health check failed — check: ssh ${HA_USER}@${HA_HOST} journalctl -u adb-tv-hub.service -n 40"
}

ENV_FILE="$ENV_FILE" "${ROOT}/scripts/install-ha-integration.sh"

if [[ "${HA_RESTART_AFTER_INTEGRATION:-1}" == "1" ]]; then
  echo "==> Restarting Home Assistant core"
  if "${SSH[@]}" "command -v ha >/dev/null 2>&1"; then
    "${SSH[@]}" "ha core restart" || echo "WARN: ha core restart failed — restart from UI"
  else
    echo "    No 'ha' CLI — restart HA from UI after adding integration"
  fi
fi

echo ""
echo "========================================="
echo " Deploy complete"
echo "========================================="
echo " Hub UI:    ${HUB_PUBLIC_URL}"
echo " Guest:     ${HUB_GUEST_URL}"
echo " HA:        http://${HA_HOST}:8123"
echo ""
echo " Next:"
echo "  1. HA → Add integration → Aatomhome Airbnb Welcome → hub URL ${HUB_PUBLIC_URL}"
echo "  2. Hub UI → register TVs (wireless debugging)"
echo "  3. Provision guest launcher APK on each TV"
echo "See deploy/forest-home/README.md"
