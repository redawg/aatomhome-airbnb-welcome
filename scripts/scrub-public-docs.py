#!/usr/bin/env python3
"""Replace site-specific names/IPs with generic public-repo examples."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SKIP_DIRS = {".git", "tv-hub", "node_modules", "__pycache__"}
SKIP_SUFFIXES = {".apk", ".idsig", ".pyc", ".png", ".jpg", ".jar"}
# Keep Android package id in bytecode/smali — only user-facing strings change elsewhere.
SKIP_GLOBS = ["guest-launcher/patches/smali/**", "guest-launcher/releases/**"]

TEXT_REPLACEMENTS = [
    ("guest@example.com", "guest@example.com"),
    ("Sample Property", "Sample Property"),
    ("Sample Property", "Sample Property"),
    ("Guest Welcome", "Guest Welcome"),
    ("Aatomhome Guest Welcome", "Aatomhome Guest Welcome"),
    ("Guest welcome", "Guest welcome"),
    ("Main TV", "Main TV"),
    ("Bedroom TV 2", "Bedroom TV 2"),
    ("Bedroom TV 3", "Bedroom TV 3"),
    ("Update all TVs", "Update all TVs"),
    ("all other TVs", "all other TVs"),
    ("every online TV", "every online TV"),
    ("all connected TVs", "all connected TVs"),
    ("Guest Suite", "Guest Suite"),
    ("Google TV", "Google TV"),
    ("property guest account", "property guest account"),
    ("property roll-out", "property roll-out"),
    ("property TVs", "property TVs"),
    ("property TV", "property TV"),
    ("legacy production", "legacy production"),
    ("property LAN", "property LAN"),
    ("home-assistant-host", "home-assistant-host"),
    ("sample-property", "sample-property"),
    ("hub.example.com", "hub.example.com"),
    ("example.com", "example.com"),
    ("192.168.1.10", "192.168.1.10"),
    ("192.168.1.100", "192.168.1.100"),
    ("192.168.1.50", "192.168.1.50"),
    ("192.168.1.10", "192.168.1.10"),
    ("192.168.2.1", "192.168.2.1"),
    ("192.168.2.50", "192.168.2.50"),
    ("192.168.1.117", "192.168.1.117"),
    ("192.168.2.0/24", "192.168.2.0/24"),
    ("http://192.168.2.1:8080", "http://192.168.1.100:8080"),
    ("lab hub", "lab hub"),
    ("lab host", "lab host"),
    ("Android TV device", "Android TV device"),
    ("PROPERTY_NAME=\"Fleet test hub\"", 'PROPERTY_NAME="Sample Property"'),
    ('PROPERTY_NAME="Sample Property (VPN pilot)"', 'PROPERTY_NAME="Sample Property (VPN)"'),
    ("Living room, Bedroom 2", "Living room, Bedroom 2"),
    ("Guest suite", "Guest suite"),
]

# Lines / sections to drop from README-style files
LINE_SUBSTRINGS_DROP = [
    "legacy production is frozen",
]


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    if parts & SKIP_DIRS:
        return True
    if path.suffix.lower() in SKIP_SUFFIXES:
        return True
    rel = path.relative_to(ROOT).as_posix()
    for pattern in SKIP_GLOBS:
        if Path(pattern).match(rel) or rel.startswith(pattern.replace("**", "")):
            return True
    return False


def scrub_text(text: str) -> str:
    for old, new in TEXT_REPLACEMENTS:
        text = text.replace(old, new)
    lines = []
    for line in text.splitlines(keepends=True):
        if any(sub in line for sub in LINE_SUBSTRINGS_DROP):
            continue
        lines.append(line)
    return "".join(lines)


def main() -> None:
    changed: list[str] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or should_skip(path):
            continue
        if path.suffix.lower() not in {
            ".md", ".py", ".js", ".html", ".sh", ".yml", ".yaml", ".json",
            ".kt", ".java", ".xml", ".txt", ".example", ".template", ".env",
            ".mdc", ".skill", ".volume", ".container",
        } and path.name not in {"AGENTS.md", "LICENSE", "NOTICE.md"}:
            continue
        try:
            original = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        updated = scrub_text(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(str(path.relative_to(ROOT)))
    print(f"Scrubbed {len(changed)} files")
    for p in sorted(changed)[:40]:
        print(f"  {p}")
    if len(changed) > 40:
        print(f"  ... and {len(changed) - 40} more")


if __name__ == "__main__":
    main()
