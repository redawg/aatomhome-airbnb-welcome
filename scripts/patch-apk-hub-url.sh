#!/usr/bin/env bash
# Patch default hub URL inside the prebuilt guest launcher APK.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

APK="${GUEST_LAUNCHER_APK:-$ROOT/guest-launcher/releases/aatomhome-guest-welcome.apk}"
HUB_BASE="${HUB_PUBLIC_URL%/}"
HUB_ONBOARD_URL="${HUB_BASE}/guest/onboard/"
HUB_GUEST_URL="${HUB_BASE}/guest/"
WORKDIR="$(mktemp -d)"
APKTOOL_JAR="${APKTOOL_JAR:-$WORKDIR/apktool.jar}"

# shellcheck source=lib/patch-apk-hub-urls.sh
source "$ROOT/scripts/lib/patch-apk-hub-urls.sh"
# shellcheck source=lib/sign-apk.sh
source "$ROOT/scripts/lib/sign-apk.sh"

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

if ! command -v java >/dev/null; then
  echo "Java required to patch APK. Install java-21-openjdk or set PATCH_APK_HUB_URL=0" >&2
  exit 1
fi

echo "==> Patching APK hub URL → $HUB_ONBOARD_URL"
curl -fsSL -o "$APKTOOL_JAR" \
  https://github.com/iBotPeaches/Apktool/releases/download/v2.11.1/apktool_2.11.1.jar

java -jar "$APKTOOL_JAR" d -f "$APK" -o "$WORKDIR/guest-apk"

for smali_root in "$WORKDIR/guest-apk"/smali*; do
  patch_apk_hub_urls "$smali_root/com/aatomhome/guestwelcome" "$smali_root/com/cielodeloro/guestwelcome"
done

java -jar "$APKTOOL_JAR" b "$WORKDIR/guest-apk" -o "$WORKDIR/guest-unsigned.apk"

cp "$WORKDIR/guest-unsigned.apk" "$APK"
sign_apk "$APK" "$WORKDIR"
(
  cd "$(dirname "$APK")"
  sha256sum "$(basename "$APK")" > "$(basename "$APK").sha256"
)

echo "==> Patched $APK"
