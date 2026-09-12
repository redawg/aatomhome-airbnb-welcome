#!/usr/bin/env bash
# Clone or update upstream adb-tv-hub into ./tv-hub at pinned tag.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

GIT_URL="${ADB_TV_HUB_GIT:-https://github.com/redawg/adb-tv-hub.git}"
TAG="${ADB_TV_HUB_TAG:-cdo-production-2026-09-11}"
DEST="$ROOT/tv-hub"

if [[ -d "$DEST/.git" ]]; then
  echo "==> Updating tv-hub in $DEST"
  git -C "$DEST" fetch origin --tags
  git -C "$DEST" checkout "$TAG"
else
  echo "==> Cloning $GIT_URL → $DEST @ $TAG"
  git clone --branch "$TAG" --depth 1 "$GIT_URL" "$DEST"
fi

echo "==> tv-hub at $(git -C "$DEST" rev-parse --short HEAD) ($TAG)"
