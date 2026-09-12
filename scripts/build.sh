#!/usr/bin/env bash
# Build tv-hub container image (no systemd install). Used for CI and pre-push verification.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "==> No deploy/.env — using defaults (copy deploy/env.template for forest-ha URLs)"
  ADB_TV_HUB_GIT="${ADB_TV_HUB_GIT:-https://github.com/redawg/adb-tv-hub.git}"
  ADB_TV_HUB_TAG="${ADB_TV_HUB_TAG:-cdo-production-2026-09-11}"
  ADB_TV_HUB_IMAGE="${ADB_TV_HUB_IMAGE:-localhost/aatomhome-tv-hub:latest}"
  PATCH_APK_HUB_URL="${PATCH_APK_HUB_URL:-0}"
fi

IMAGE="${ADB_TV_HUB_IMAGE:-localhost/aatomhome-tv-hub:latest}"

echo "========================================="
echo " Aatomhome Airbnb Welcome — build"
echo "========================================="
echo " Image: $IMAGE"
echo " Tag:   ${ADB_TV_HUB_TAG:-cdo-production-2026-09-11}"
echo ""

ENV_FILE="$ENV_FILE" "$ROOT/scripts/fetch-upstream.sh"

APK_SRC="${GUEST_LAUNCHER_APK:-$ROOT/guest-launcher/releases/aatomhome-guest-welcome.apk}"
[[ "$APK_SRC" != /* ]] && APK_SRC="$ROOT/$APK_SRC"
APK_DEST="$ROOT/tv-hub/guest-launcher/cielodeloro-guestwelcome.apk"
mkdir -p "$(dirname "$APK_DEST")"

if [[ "${PATCH_APK_HUB_URL:-0}" == "1" ]]; then
  [[ -f "$ENV_FILE" ]] || { echo "ERROR: PATCH_APK_HUB_URL=1 requires deploy/.env with HUB_GUEST_URL" >&2; exit 1; }
  "$ROOT/scripts/patch-apk-hub-url.sh"
fi

cp "$APK_SRC" "$APK_DEST"
echo "==> Copied guest launcher APK → tv-hub"

echo "==> Building $IMAGE"
podman build -t "$IMAGE" -f "$ROOT/tv-hub/Containerfile" "$ROOT/tv-hub"

echo ""
echo "Build OK: $IMAGE"
echo "Deploy on forest-ha: cp deploy/env.template deploy/.env && ./scripts/deploy.sh"
