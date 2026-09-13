#!/usr/bin/env bash
# Sign an APK with zipalign + APK Signature Scheme v2/v3 (required on Android TV / Shield).
# Usage: sign_apk <path-to.apk> [workdir]
set -euo pipefail

sign_apk() {
  local apk="$1"
  local workdir="${2:-$(mktemp -d)}"
  local signer="${UBER_APK_SIGNER:-$workdir/uber-apk-signer.jar}"

  if [[ ! -f "$apk" ]]; then
    echo "sign_apk: file not found: $apk" >&2
    return 1
  fi
  if ! command -v java >/dev/null; then
    echo "sign_apk: java required" >&2
    return 1
  fi

  if [[ ! -f "$signer" ]]; then
    curl -fsSL -o "$signer" \
      https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar
  fi

  java -jar "$signer" --apks "$apk" --allowResign --overwrite

  # Verify v2/v3 present (fails if only v1 JAR signing).
  local verify_out
  verify_out="$(java -jar "$signer" --verify "$apk" 2>&1 || true)"
  if ! grep -qE 'signature verified.*\[v2' <<<"$verify_out"; then
    echo "sign_apk: verify failed — v2/v3 signature missing on $apk" >&2
    echo "$verify_out" >&2
    return 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  sign_apk "${1:?usage: sign-apk.sh <apk>}"
fi
