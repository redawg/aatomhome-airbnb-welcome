#!/usr/bin/env bash
# Full guest launcher rebuild: HOME role, boot receiver, accessibility, hub URL patch, v2/v3 sign.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

BASE_APK="${GUEST_LAUNCHER_BASE_APK:-$ROOT/tv-hub/guest-launcher/cielodeloro-guestwelcome.apk}"
OUTPUT_APK="${GUEST_LAUNCHER_APK:-$ROOT/guest-launcher/releases/aatomhome-guest-welcome.apk}"
PATCHES="${GUEST_LAUNCHER_PATCHES:-$ROOT/guest-launcher/patches}"
if [[ -n "${HUB_PUBLIC_URL:-}" ]]; then
  HUB_BASE="${HUB_PUBLIC_URL%/}"
elif [[ -n "${HUB_GUEST_URL:-}" ]]; then
  HUB_BASE="$(echo "${HUB_GUEST_URL%/}" | sed -E 's|/guest(/onboard)?/?$||')"
else
  HUB_BASE="http://192.168.1.100:8080"
fi
HUB_ONBOARD_URL="${HUB_BASE}/guest/onboard/"
HUB_GUEST_URL="${HUB_BASE}/guest/"
HUB_URL="$HUB_ONBOARD_URL"
WORKDIR="$(mktemp -d)"
APKTOOL_JAR="${APKTOOL_JAR:-$WORKDIR/apktool.jar}"

# shellcheck source=lib/sign-apk.sh
source "$ROOT/scripts/lib/sign-apk.sh"
# shellcheck source=lib/patch-apk-hub-urls.sh
source "$ROOT/scripts/lib/patch-apk-hub-urls.sh"

if [[ ! -f "$BASE_APK" ]]; then
  echo "Base APK not found: $BASE_APK" >&2
  echo "Run: ENV_FILE=$ENV_FILE $ROOT/scripts/fetch-upstream.sh" >&2
  exit 1
fi

echo "==> Rebuilding guest launcher"
echo "    Base:   $BASE_APK"
echo "    Output: $OUTPUT_APK"
echo "    Hub:    $HUB_URL"

curl -fsSL -o "$APKTOOL_JAR" \
  https://github.com/iBotPeaches/Apktool/releases/download/v2.11.1/apktool_2.11.1.jar

java -jar "$APKTOOL_JAR" d -f "$BASE_APK" -o "$WORKDIR/guest-apk"

MANIFEST="$WORKDIR/guest-apk/AndroidManifest.xml"
sed -i \
  -e 's/package="com\.cielodeloro\.guestwelcome"/package="com.aatomhome.guestwelcome"/' \
  -e 's/com\.cielodeloro\.guestwelcome/com.aatomhome.guestwelcome/g' \
  "$MANIFEST"
if ! grep -q 'RECEIVE_BOOT_COMPLETED' "$MANIFEST"; then
  sed -i 's|<uses-permission android:name="android.permission.INTERNET"/>|<uses-permission android:name="android.permission.INTERNET"/>\n    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>|' "$MANIFEST"
fi

python3 - "$MANIFEST" "$PATCHES/AndroidManifest.fragment.xml" <<'PY'
import re
import sys
from pathlib import Path

manifest = Path(sys.argv[1])
fragment = Path(sys.argv[2]).read_text()
text = manifest.read_text()
pattern = re.compile(
    r'<activity\b[^>]*android:name="com\.(?:cielodeloro|aatomhome)\.guestwelcome\.MainActivity"[^>]*>.*?</activity>',
    re.DOTALL,
)
if not pattern.search(text):
    raise SystemExit("MainActivity block not found in AndroidManifest.xml")
text = pattern.sub(fragment.strip(), text, count=1)

def upsert_attr(xml: str, tag: str, name: str, value: str) -> str:
    attr = f'android:{name}="{value}"'
    tag_open = re.search(rf"<{tag}\b[^>]*>", xml)
    if not tag_open:
        return xml
    block = tag_open.group(0)
    if re.search(rf'android:{name}="', block):
        new_block = re.sub(rf'android:{name}="[^"]*"', attr, block, count=1)
    else:
        new_block = block.replace(f"<{tag}", f"<{tag} {attr}", 1)
    return xml.replace(block, new_block, 1)

for _name, _value in (
    ("icon", "@mipmap/ic_launcher"),
    ("roundIcon", "@mipmap/ic_launcher_round"),
    ("banner", "@drawable/tv_banner"),
    ("usesCleartextTraffic", "true"),
    ("networkSecurityConfig", "@xml/network_security_config"),
):
    text = upsert_attr(text, "application", _name, _value)

manifest.write_text(text)
PY

mkdir -p "$WORKDIR/guest-apk/res/xml"
cat > "$WORKDIR/guest-apk/res/xml/network_security_config.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
XML

mkdir -p "$WORKDIR/guest-apk/res/xml" "$WORKDIR/guest-apk/res/values"
cp "$PATCHES/res/xml/welcome_accessibility.xml" "$WORKDIR/guest-apk/res/xml/welcome_accessibility.xml"
STRINGS="$WORKDIR/guest-apk/res/values/strings.xml"
PKG_OLD="com.cielodeloro.guestwelcome"
PKG_NEW="com.aatomhome.guestwelcome"
PKG_OLD_PATH="com/cielodeloro/guestwelcome"
PKG_NEW_PATH="com/aatomhome/guestwelcome"
for smali_root in "$WORKDIR/guest-apk/smali" "$WORKDIR/guest-apk/smali_classes2" "$WORKDIR/guest-apk/smali_classes3" "$WORKDIR/guest-apk/smali_classes4"; do
  if [[ -d "$smali_root/$PKG_OLD_PATH" ]]; then
    mkdir -p "$smali_root/$(dirname "$PKG_NEW_PATH")"
    mv "$smali_root/$PKG_OLD_PATH" "$smali_root/$PKG_NEW_PATH"
  fi
done
# Rewrite any remaining dotted/slash package refs in smali (R classes, inner classes).
find "$WORKDIR/guest-apk" -name '*.smali' -print0 | xargs -0 sed -i \
  -e "s|L${PKG_OLD//./\/}|L${PKG_NEW//./\/}|g" \
  -e "s|$PKG_OLD|$PKG_NEW|g"
sed -i "s/$PKG_OLD/$PKG_NEW/g" "$MANIFEST"
# Drop stock MainActivity dex (patched copy replaces it — avoids missing Kotlin $Companion).
for smali_root in "$WORKDIR/guest-apk/smali" "$WORKDIR/guest-apk/smali_classes2" "$WORKDIR/guest-apk/smali_classes3" "$WORKDIR/guest-apk/smali_classes4"; do
  rm -f "$smali_root/$PKG_OLD_PATH/MainActivity"*.smali 2>/dev/null || true
  rm -f "$smali_root/$PKG_NEW_PATH/MainActivity"*.smali 2>/dev/null || true
done
mkdir -p "$WORKDIR/guest-apk/smali_classes3/$PKG_NEW_PATH"
cp "$PATCHES/smali/"*.smali "$WORKDIR/guest-apk/smali_classes3/$PKG_NEW_PATH/"

apply_generic_apk_branding() {
  local smali_dir="$1"
  [[ -f "$STRINGS" ]] && sed -i \
    -e 's|<string name="app_name">[^<]*</string>|<string name="app_name">Guest Welcome</string>|' \
    -e 's|<string name="welcome_accessibility_desc">[^<]*</string>|<string name="welcome_accessibility_desc">Returns to the guest welcome screen after streaming apps are closed.</string>|' \
    "$STRINGS"
  if [[ -d "$smali_dir" ]]; then
    find "$smali_dir" -name '*.smali' -print0 | xargs -0 sed -i \
      -e 's/Cielo del Oro Guest/Guest Welcome/g' \
      -e 's/Cielo del Oro/Guest Welcome/g' \
      -e 's/Cielo guest welcome/guest welcome/g' \
      -e 's/Cielo Guest Welcome/Guest Welcome/g'
  fi
}

if [[ -x "$ROOT/tv-hub/scripts/generate-guest-launcher-icons.sh" ]]; then
  "$ROOT/tv-hub/scripts/generate-guest-launcher-icons.sh"
fi
if [[ -d "$PATCHES/res" ]]; then
  while IFS= read -r -d '' f; do
    rel="${f#$PATCHES/res/}"
    case "$rel" in
      mipmap-anydpi-v26/*) continue ;;
      mipmap-*/*|drawable/*|drawable-*/*) ;;
      *) continue ;;
    esac
    mkdir -p "$WORKDIR/guest-apk/res/$(dirname "$rel")"
    cp "$f" "$WORKDIR/guest-apk/res/$rel"
  done < <(find "$PATCHES/res" -type f -print0)
  rm -f "$WORKDIR/guest-apk/res/drawable/ic_launcher_foreground.xml"
  rm -f "$WORKDIR/guest-apk/res/drawable/tv_banner.xml"
  rm -f "$WORKDIR/guest-apk/res/drawable/ic_launcher_background.xml"
  rm -rf "$WORKDIR/guest-apk/res/mipmap-anydpi-v26"
  rm -f "$WORKDIR/guest-apk/res/values-anydpi-v26/mipmaps.xml"
  COLORS_PATCH="$PATCHES/res/values/colors.xml"
  if [[ -f "$COLORS_PATCH" ]]; then
    COLORS_APK="$WORKDIR/guest-apk/res/values/colors.xml"
    if [[ -f "$COLORS_APK" ]]; then
      if ! grep -q 'ic_launcher_background' "$COLORS_APK"; then
        sed -i 's|</resources>|    <color name="ic_launcher_background">#121820</color>\n</resources>|' "$COLORS_APK"
      else
        sed -i 's|<color name="ic_launcher_background">[^<]*</color>|<color name="ic_launcher_background">#121820</color>|' "$COLORS_APK"
      fi
    else
      cp "$COLORS_PATCH" "$COLORS_APK"
    fi
  fi
fi

SMALI_DIR="$WORKDIR/guest-apk/smali_classes3/com/aatomhome/guestwelcome"
apply_generic_apk_branding "$SMALI_DIR"
for smali_root in "$WORKDIR/guest-apk"/smali*; do
  patch_apk_hub_urls "$smali_root/com/aatomhome/guestwelcome" "$smali_root/com/cielodeloro/guestwelcome"
done

APKTOOL_YML="$WORKDIR/guest-apk/apktool.yml"
if [[ -f "$APKTOOL_YML" ]]; then
  BUILD_NUM="$(date +%Y%m%d%H)"
  sed -i "s/^  versionCode:.*/  versionCode: ${BUILD_NUM}/" "$APKTOOL_YML"
  sed -i 's/^  versionName:.*/  versionName: 1.1.0/' "$APKTOOL_YML"
fi

java -jar "$APKTOOL_JAR" b "$WORKDIR/guest-apk" -o "$WORKDIR/guest-unsigned.apk"

mkdir -p "$(dirname "$OUTPUT_APK")"
cp "$WORKDIR/guest-unsigned.apk" "$OUTPUT_APK"
sign_apk "$OUTPUT_APK" "$WORKDIR"

(
  cd "$(dirname "$OUTPUT_APK")"
  sha256sum "$(basename "$OUTPUT_APK")" > "$(basename "$OUTPUT_APK").sha256"
)

echo "==> Rebuilt $OUTPUT_APK (APK Signature v2/v3)"
echo "    Hub URL: $HUB_URL"
echo "    Push to TV: ./scripts/dev-push-guest-launcher.sh"
echo "    Or: hub → Push welcome app, or POST /api/aatomhome/registry/{id}/deploy-launcher"

if [[ "${DEV_PUSH:-0}" == "1" ]]; then
  cp "$OUTPUT_APK" "$ROOT/tv-hub/guest-launcher/aatomhome-guest-welcome.apk"
  ENV_FILE="$ENV_FILE" "$ROOT/scripts/dev-push-guest-launcher.sh"
fi
