#!/usr/bin/env bash
# Copy aatomhome extensions into fetched tv-hub and wire into main.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/tv-hub"
EXT_SRC="$ROOT/extensions/tv-hub/backend/aatomhome"
MAIN="$DEST/backend/main.py"
MARKER="# aatomhome-extensions-installed"

[[ -d "$DEST/backend" ]] || { echo "ERROR: tv-hub not fetched — run fetch-upstream.sh first" >&2; exit 1; }
[[ -d "$EXT_SRC" ]] || { echo "ERROR: missing $EXT_SRC" >&2; exit 1; }

echo "==> Applying aatomhome extensions to tv-hub"
mkdir -p "$DEST/backend/aatomhome"
rsync -a --delete "$EXT_SRC/" "$DEST/backend/aatomhome/"

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

echo "==> Extensions applied"
