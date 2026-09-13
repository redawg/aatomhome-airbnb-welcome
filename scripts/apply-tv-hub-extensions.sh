#!/usr/bin/env bash
# Copy aatomhome extensions into fetched tv-hub and wire into main.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/tv-hub"
EXT_SRC="$ROOT/extensions/tv-hub/backend/aatomhome"
EXT_ROOT="$ROOT/extensions/tv-hub"
MAIN="$DEST/backend/main.py"
CONTAINERFILE="$DEST/Containerfile"
MARKER="# aatomhome-extensions-installed"
CF_MARKER="# aatomhome-listen-port-entrypoint"

[[ -d "$DEST/backend" ]] || { echo "ERROR: tv-hub not fetched — run fetch-upstream.sh first" >&2; exit 1; }
[[ -d "$EXT_SRC" ]] || { echo "ERROR: missing $EXT_SRC" >&2; exit 1; }

echo "==> Applying aatomhome extensions to tv-hub"
mkdir -p "$DEST/backend/aatomhome"
rsync -a --delete "$EXT_SRC/" "$DEST/backend/aatomhome/"

if [[ -d "$EXT_ROOT/frontend" ]]; then
  rsync -a "$EXT_ROOT/frontend/" "$DEST/frontend/"
  echo "==> Applied frontend extensions"
fi

if ! grep -q "$MARKER" "$MAIN" 2>/dev/null; then
  cat >> "$MAIN" <<'PY'

# aatomhome-extensions-installed
try:
    from aatomhome.bootstrap import install_aatomhome_extensions
    install_aatomhome_extensions(app)
except ImportError:
    pass
PY
  echo "==> Patched main.py with extension bootstrap"
else
  echo "==> main.py already has extension bootstrap"
fi

cp "$EXT_ROOT/entrypoint.sh" "$DEST/entrypoint.sh"
chmod +x "$DEST/entrypoint.sh"

if ! grep -q "$CF_MARKER" "$CONTAINERFILE" 2>/dev/null; then
  sed -i 's|^CMD \["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"\]|# aatomhome-listen-port-entrypoint\nENV HUB_LISTEN_PORT=8080\nCOPY entrypoint.sh /app/entrypoint.sh\nRUN chmod +x /app/entrypoint.sh\nCMD ["/app/entrypoint.sh"]|' "$CONTAINERFILE"
  echo "==> Patched Containerfile for HUB_LISTEN_PORT entrypoint"
else
  echo "==> Containerfile already has listen-port entrypoint"
fi

echo "==> Extensions applied"
