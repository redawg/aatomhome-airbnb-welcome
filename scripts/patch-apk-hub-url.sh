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
HUB_URL="${HUB_GUEST_URL:-${HUB_PUBLIC_URL%/}/guest/}"
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
for smali in MainActivity.smali BootReceiver.smali; do
  if [[ -f "$SMALI_DIR/$smali" ]]; then
    sed -i \
      -e "s|http://localhost:8080/guest/|${HUB_URL}|g" \
      -e "s|http://172.18.1.137:8080/guest/|${HUB_URL}|g" \
      "$SMALI_DIR/$smali"
  fi
done

java -jar "$APKTOOL_JAR" b "$WORKDIR/guest-apk" -o "$WORKDIR/guest-unsigned.apk"

KEYSTORE="$WORKDIR/debug.keystore"
keytool -genkey -v -keystore "$KEYSTORE" -storepass android -alias androiddebugkey \
  -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1 || true
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore "$KEYSTORE" -storepass android "$WORKDIR/guest-unsigned.apk" androiddebugkey

cp "$WORKDIR/guest-unsigned.apk" "$APK"
(
  cd "$(dirname "$APK")"
  sha256sum "$(basename "$APK")" > "$(basename "$APK").sha256"
)

echo "==> Patched $APK"
