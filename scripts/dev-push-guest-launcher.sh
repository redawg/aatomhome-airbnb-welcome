#!/usr/bin/env bash
# Dev loop: rebuild guest launcher (optional), ADB-connect TV, push APK via hub, relaunch welcome.
#
# Usage:
#   ./scripts/dev-push-guest-launcher.sh                    # push existing APK
#   ./scripts/dev-push-guest-launcher.sh --rebuild          # rebuild then push
#   ./scripts/dev-push-guest-launcher.sh --device-id 11     # hub registry id (default 11)
#   TV_HOST=172.16.1.220 TV_PORT=5555 ./scripts/dev-push-guest-launcher.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/profiles/container/.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

HUB_BASE="${HUB_PUBLIC_URL%/}"
HUB_API="${HUB_BASE}/api"
DEVICE_ID="${TV_DEVICE_ID:-11}"
TV_HOST="${TV_HOST:-172.16.1.220}"
TV_PORT="${TV_PORT:-5555}"
REBUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebuild) REBUILD=1; shift ;;
    --device-id) DEVICE_ID="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }

echo "==> Guest launcher dev push"
echo "    Hub:    $HUB_BASE"
echo "    TV:     $TV_HOST:$TV_PORT (registry id $DEVICE_ID)"

if [[ "$REBUILD" -eq 1 ]]; then
  echo "==> Rebuilding APK…"
  ENV_FILE="$ENV_FILE" "$ROOT/scripts/rebuild-guest-launcher-apk.sh"
  cp "$ROOT/guest-launcher/releases/aatomhome-guest-welcome.apk" \
    "$ROOT/tv-hub/guest-launcher/aatomhome-guest-welcome.apk"
fi

# Prefer hub ADB (mDNS discover + connect) — works when workstation has no adb.
echo "==> ADB connect via hub…"
CONNECT_JSON="$(curl -sf -X POST "$HUB_API/registry/$DEVICE_ID/connect" 2>/dev/null || true)"
if [[ -z "$CONNECT_JSON" ]]; then
  echo "WARN: Hub connect API failed — trying local adb connect $TV_HOST:$TV_PORT"
  if command -v adb >/dev/null 2>&1; then
    adb connect "$TV_HOST:$TV_PORT" || true
  else
    die "Hub unreachable at $HUB_BASE and adb not installed locally"
  fi
else
  echo "    $(echo "$CONNECT_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('message','ok'))" 2>/dev/null || echo "$CONNECT_JSON")"
fi

echo "==> Deploy launcher (force reinstall + launch)…"
DEPLOY_JSON="$(curl -sf -X POST "$HUB_API/aatomhome/registry/$DEVICE_ID/deploy-launcher" \
  -H "Content-Type: application/json" \
  -d '{"set_home":false,"launch_welcome":true,"force_reinstall":true}')" \
  || die "deploy-launcher failed — is hub up at $HUB_BASE?"

python3 - <<'PY' "$DEPLOY_JSON"
import json, sys
d = json.loads(sys.argv[1])
print("    ok:", d.get("ok"))
for msg in d.get("messages") or []:
    print("   ", msg)
if not d.get("ok"):
    for s in d.get("steps") or []:
        if not s.get("ok") and not s.get("skipped"):
            print("    FAIL:", s.get("action"), s.get("message"))
    sys.exit(1)
PY

echo "==> Done — check the TV for the connect screen or welcome dashboard."
