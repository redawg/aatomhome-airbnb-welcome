#!/usr/bin/env bash
# Shared deploy env helpers — profile, host, listen port → HUB_PUBLIC_URL.
# Source from other scripts: source "$(dirname "$0")/lib/deploy-env.sh"

deploy_env_profile_defaults() {
  case "${1:-}" in
    forest-lan)
      echo "172.16.255.250 8080"
      ;;
    infra3-standalone)
      echo "172.16.1.36 18080"
      ;;
    cdo-vpn)
      echo "172.16.1.36 18080"
      ;;
    forest-ha|aatomhome)
      echo "172.16.1.30 8080"
      ;;
    custom)
      echo "127.0.0.1 8080"
      ;;
    *)
      echo "127.0.0.1 8080"
      ;;
  esac
}

deploy_env_build_urls() {
  local host="$1" port="$2"
  host="${host%/}"
  export HUB_HOST="$host"
  export HUB_LISTEN_PORT="$port"
  export HUB_PUBLIC_URL="http://${host}:${port}"
  export HUB_GUEST_URL="http://${host}:${port}/guest/"
}

deploy_env_write_runtime() {
  local dest="$1"
  cat > "$dest" <<EOF
HUB_PUBLIC_URL=${HUB_PUBLIC_URL}
HUB_LISTEN_PORT=${HUB_LISTEN_PORT}
TEMPEST_API_TOKEN=${TEMPEST_API_TOKEN:-}
TEMPEST_STATION_ID=${TEMPEST_STATION_ID:-}
HA_URL=${HA_URL:-}
HA_LONG_LIVED_TOKEN=${HA_LONG_LIVED_TOKEN:-}
EOF
}

deploy_env_sync_urls_from_file() {
  local env_file="$1"
  # shellcheck disable=SC1090
  source "$env_file"
  if [[ -n "${HUB_HOST:-}" && -n "${HUB_LISTEN_PORT:-}" ]]; then
    deploy_env_build_urls "$HUB_HOST" "$HUB_LISTEN_PORT"
    return 0
  fi
  if [[ -n "${HUB_PUBLIC_URL:-}" ]]; then
    local url="${HUB_PUBLIC_URL%/}"
    if [[ "$url" =~ ^https?://([^:/]+):([0-9]+)$ ]]; then
      deploy_env_build_urls "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
      return 0
    fi
  fi
  return 1
}
