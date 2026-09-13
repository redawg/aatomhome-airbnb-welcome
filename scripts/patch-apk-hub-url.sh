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
HUB_URL="${HUB_GUEST_URL:-${HUB_PUBLIC_URL%/}/guest/onboard/}"
WORKDIR="$(mktemp -d)"
APKTOOL_JAR="${APKTOOL_JAR:-$WORKDIR/apktool.jar}"

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

if ! command -v java >/dev/null; then
  echo "Java required to patch APK. Install java-21-openjdk or set PATCH_APK_HUB_URL=0" >&2
  exit 1
fi

echo "==> Patching APK hub URL → $HUB_URL"
curl -fsSL -o "$APKTOOL_JAR" \
  https://github.com/iBotPeaches/Apktool/releases/download/v2.11.1/apktool_2.11.1.jar

java -jar "$APKTOOL_JAR" d -f "$APK" -o "$WORKDIR/guest-apk"

SMALI_DIR="$WORKDIR/guest-apk/smali_classes3/com/cielodeloro/guestwelcome"
if [[ -d "$SMALI_DIR" ]]; then
  find "$SMALI_DIR" -name '*.smali' -print0 | xargs -0 sed -i \
    -e "s|http://localhost:8080/guest/|${HUB_URL}|g" \
    -e "s|http://192.168.2.1:8080/guest/|${HUB_URL}|g" \
    -e "s|http://172.18.1.137:8080/guest/|${HUB_URL}|g" \
    -e "s|http://172.16.1.36:18080/guest/|${HUB_URL}|g" \
    -e "s|http://192.168.1.100:8080/guest/|${HUB_URL}|g"
fi

java -jar "$APKTOOL_JAR" b "$WORKDIR/guest-apk" -o "$WORKDIR/guest-unsigned.apk"

# shellcheck source=lib/sign-apk.sh
source "$ROOT/scripts/lib/sign-apk.sh"
cp "$WORKDIR/guest-unsigned.apk" "$APK"
sign_apk "$APK" "$WORKDIR"
(
  cd "$(dirname "$APK")"
  sha256sum "$(basename "$APK")" > "$(basename "$APK").sha256"
)

echo "==> Patched $APK"
