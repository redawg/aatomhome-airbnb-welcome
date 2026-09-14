#!/usr/bin/env bash
# Patch hub URL strings in decompiled guest-launcher smali (safe ordering — no /guest/onboard/ doubling).
#
# Usage: patch_apk_hub_urls <smali_root_dir> [more_dirs...]
# Requires: HUB_PUBLIC_URL or HUB_BASE + HUB_ONBOARD_URL in caller env.
patch_apk_hub_urls() {
  local hub_base="${HUB_BASE:-}"
  local hub_onboard="${HUB_ONBOARD_URL:-}"
  local hub_guest="${HUB_GUEST_URL:-}"

  if [[ -z "$hub_base" ]]; then
    hub_base="${HUB_PUBLIC_URL%/}"
  fi
  if [[ -z "$hub_onboard" ]]; then
    hub_onboard="${hub_base}/guest/onboard/"
  fi
  if [[ -z "$hub_guest" ]]; then
    hub_guest="${hub_base}/guest/"
  fi

  local dirs=("$@")
  if [[ ${#dirs[@]} -eq 0 ]]; then
    echo "patch_apk_hub_urls: no smali directories given" >&2
    return 1
  fi

  local patterns=(
    "http://localhost:8080/guest/onboard/"
    "http://192.168.2.1:8080/guest/onboard/"
    "http://172.18.1.137:8080/guest/onboard/"
    "http://172.16.1.36:18080/guest/onboard/"
    "http://192.168.1.100:8080/guest/onboard/"
    "http://localhost:8080/guest/"
    "http://192.168.2.1:8080/guest/"
    "http://172.18.1.137:8080/guest/"
    "http://172.16.1.36:18080/guest/"
    "http://192.168.1.100:8080/guest/"
    "http://localhost:8080"
    "http://192.168.2.1:8080"
    "http://172.18.1.137:8080"
    "http://172.16.1.36:18080"
    "http://192.168.1.100:8080"
  )

  local targets=(
    "$hub_onboard"
    "$hub_onboard"
    "$hub_onboard"
    "$hub_onboard"
    "$hub_onboard"
    "$hub_guest"
    "$hub_guest"
    "$hub_guest"
    "$hub_guest"
    "$hub_guest"
    "$hub_base"
    "$hub_base"
    "$hub_base"
    "$hub_base"
    "$hub_base"
  )

  for dir in "${dirs[@]}"; do
    [[ -d "$dir" ]] || continue
    local i
    for i in "${!patterns[@]}"; do
      # shellcheck disable=SC2086
      find "$dir" -name '*.smali' -print0 | xargs -0 sed -i \
        -e "s|${patterns[$i]}|${targets[$i]}|g"
    done
    # Repair APKs that were double-patched in older builds.
    find "$dir" -name '*.smali' -print0 | xargs -0 sed -i \
      -e "s|/guest/onboard/onboard/|/guest/onboard/|g" \
      -e "s|/guest/onboard/onboard\"|/guest/onboard/\"|g"
  done
}
