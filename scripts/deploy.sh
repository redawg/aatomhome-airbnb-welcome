#!/usr/bin/env bash
# Deploy tv-hub + copy HA integration using deploy/.env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/.env"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy deploy/env.template and fill in QUESTIONNAIRE answers"

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${HUB_PUBLIC_URL:?Set HUB_PUBLIC_URL in deploy/.env}"
: "${HUB_GUEST_URL:?Set HUB_GUEST_URL in deploy/.env}"

echo "========================================="
echo " Aatomhome Airbnb Welcome — deploy"
echo "========================================="
echo " Hub: $HUB_PUBLIC_URL"
echo " HA:  ${HA_URL:-not set}"
echo ""

"$ROOT/scripts/fetch-upstream.sh"

APK_SRC="${GUEST_LAUNCHER_APK:-$ROOT/guest-launcher/releases/aatomhome-guest-welcome.apk}"
APK_DEST="$ROOT/tv-hub/guest-launcher/aatomhome-guest-welcome.apk"
mkdir -p "$(dirname "$APK_DEST")"

if [[ "${PATCH_APK_HUB_URL:-1}" == "1" ]]; then
  "$ROOT/scripts/patch-apk-hub-url.sh"
fi

cp "$APK_SRC" "$APK_DEST"
echo "==> Copied guest launcher APK → tv-hub"

IMAGE="${ADB_TV_HUB_IMAGE:-localhost/aatomhome-tv-hub:latest}"
echo "==> Building $IMAGE"
podman build -t "$IMAGE" -f "$ROOT/tv-hub/Containerfile" "$ROOT/tv-hub"

DEPLOY_PROFILE="${DEPLOY_PROFILE:-container}"
QUADLET_DIR="$(dirname "$0")/../deploy/profiles/container"
# shellcheck source=lib/deploy-env.sh
source "$ROOT/scripts/lib/deploy-env.sh"
QUADLET_DIR="$(deploy_env_quadlet_dir "$ROOT" "$DEPLOY_PROFILE")"
QUADLET_SRC="$QUADLET_DIR/adb-tv-hub.container"
QUADLET_ENV="$QUADLET_DIR/adb-tv-hub.env"
if [[ -f "$QUADLET_SRC" ]]; then
  PODMAN_MODE="${PODMAN_MODE:-rootless}"
  if [[ "$PODMAN_MODE" == "rootful" ]]; then
    TARGET="/etc/containers/systemd"
    SYSTEMCTL="sudo systemctl"
    sudo mkdir -p "$TARGET"
    sudo cp "$QUADLET_SRC" "$TARGET/"
    [[ -f "$QUADLET_DIR/adb-tv-hub-data.volume" ]] && sudo cp "$QUADLET_DIR/adb-tv-hub-data.volume" "$TARGET/"
    sudo tee "$TARGET/adb-tv-hub.env" >/dev/null <<EOF
HUB_PUBLIC_URL=${HUB_PUBLIC_URL}
TEMPEST_API_TOKEN=${TEMPEST_API_TOKEN:-}
TEMPEST_STATION_ID=${TEMPEST_STATION_ID:-}
HA_URL=${HA_URL:-}
HA_LONG_LIVED_TOKEN=${HA_LONG_LIVED_TOKEN:-}
EOF
  else
    TARGET="${HOME}/.config/containers/systemd"
    mkdir -p "$TARGET"
    cp "$QUADLET_SRC" "$TARGET/"
    # Generate env from deploy/.env
    [[ -f "$QUADLET_DIR/adb-tv-hub-data.volume" ]] && cp "$QUADLET_DIR/adb-tv-hub-data.volume" "$TARGET/"
    cat > "$TARGET/adb-tv-hub.env" <<EOF
HUB_PUBLIC_URL=${HUB_PUBLIC_URL}
TEMPEST_API_TOKEN=${TEMPEST_API_TOKEN:-}
TEMPEST_STATION_ID=${TEMPEST_STATION_ID:-}
HA_URL=${HA_URL:-}
HA_LONG_LIVED_TOKEN=${HA_LONG_LIVED_TOKEN:-}
EOF
    if ! loginctl show-user "$(whoami)" -p Linger 2>/dev/null | grep -q yes; then
      echo "==> Enabling user lingering"
      sudo loginctl enable-linger "$(whoami)"
    fi
    SYSTEMCTL="systemctl --user"
  fi
  sed -i "s|^Image=.*|Image=$IMAGE|" "$TARGET/adb-tv-hub.container"
  $SYSTEMCTL daemon-reload
  $SYSTEMCTL restart adb-tv-hub.service || $SYSTEMCTL start adb-tv-hub.service
  echo "==> tv-hub service started"
fi

if [[ -n "${HA_HOST:-}" ]]; then
  ENV_FILE="$ENV_FILE" "$ROOT/scripts/install-ha-integration.sh"
elif [[ -n "${HA_CONFIG_DIR:-}" && -d "$HA_CONFIG_DIR" ]]; then
  ENV_FILE="$ENV_FILE" "$ROOT/scripts/install-ha-integration.sh"
else
  echo "==> Skip HA integration (set HA_HOST or HA_CONFIG_DIR)"
fi

echo ""
echo "Verify:"
echo "  curl -s ${HUB_PUBLIC_URL}/api/health"
echo "  curl -s ${HUB_PUBLIC_URL}/api/registry"
echo ""
echo "Manual TV steps: wireless debugging pair → Register TV → Provision → Home → Always"
echo "See docs/DEPLOY.md"
