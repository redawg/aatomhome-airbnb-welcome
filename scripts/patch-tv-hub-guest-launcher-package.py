#!/usr/bin/env python3
"""Point tv-hub guest_launcher + Containerfile at generic com.aatomhome.guestwelcome package."""
from __future__ import annotations

import re
import sys
from pathlib import Path

PACKAGE = "com.aatomhome.guestwelcome"
APK_NAME = "aatomhome-guest-welcome.apk"
APK_CONTAINER_PATH = f"/app/guest-launcher/{APK_NAME}"


def patch_guest_launcher(path: Path) -> bool:
    if not path.is_file():
        return False
    text = path.read_text()
    new = text
    new = re.sub(
        r'^GUEST_LAUNCHER_PACKAGE = ".*"$',
        f'GUEST_LAUNCHER_PACKAGE = "{PACKAGE}"',
        new,
        count=1,
        flags=re.MULTILINE,
    )
    new = re.sub(
        r'os\.environ\.get\("GUEST_LAUNCHER_APK", "/app/guest-launcher/[^"]+"\)',
        f'os.environ.get("GUEST_LAUNCHER_APK", "{APK_CONTAINER_PATH}")',
        new,
        count=1,
    )
    new = new.replace(
        '"""Cielo del Oro guest welcome launcher — no Projectivy required."""',
        '"""Aatomhome guest welcome launcher — generic multi-site TV home app."""',
        1,
    )
    if "def onboard_page_url(" not in new:
        anchor = "def guest_page_url(hub_url: str | None = None) -> str:\n    base = (hub_url or DEFAULT_HUB_URL).rstrip(\"/\")\n    return f\"{base}/guest/\"\n"
        insert = (
            anchor
            + "\n\n"
            + "def onboard_page_url(hub_url: str | None = None) -> str:\n"
            + "    base = (hub_url or DEFAULT_HUB_URL).rstrip(\"/\")\n"
            + "    return f\"{base}/guest/onboard/\"\n"
        )
        if anchor in new:
            new = new.replace(anchor, insert, 1)
    new = re.sub(
        r"async def launch_guest_welcome\(\n    serial: str,\n    user_id: int = MAIN_USER_ID,\n    hub_url: str \| None = None,\n    \*,\n    force: bool = False,\n\) -> dict:",
        "async def launch_guest_welcome(\n    serial: str,\n    user_id: int = MAIN_USER_ID,\n    hub_url: str | None = None,\n    *,\n    force: bool = False,\n    page_url: str | None = None,\n) -> dict:",
        new,
        count=1,
    )
    new = new.replace(
        "    url = guest_page_url(hub_url)\n",
        "    url = page_url or onboard_page_url(hub_url)\n",
        1,
    )
    if new == text:
        return False
    path.write_text(new)
    return True


def patch_containerfile(path: Path) -> bool:
    if not path.is_file():
        return False
    text = path.read_text()
    new = re.sub(
        r"GUEST_LAUNCHER_APK=/app/guest-launcher/[^\s\\]+",
        f"GUEST_LAUNCHER_APK={APK_CONTAINER_PATH}",
        text,
        count=1,
    )
    if new == text:
        return False
    path.write_text(new)
    return True


def patch_main_hub_config(path: Path) -> bool:
    if not path.is_file():
        return False
    text = path.read_text()
    old = (
        '    guest_url = f"{base}/guest/"\n'
        '    return Response(\n'
        '        content=(\n'
        '            f\'window.HUB_BASE_URL="{base}";\\n\'\n'
        '            f\'window.GUEST_PAGE_URL="{guest_url}";\\n\'\n'
        "        ),\n"
    )
    new = (
        '    guest_url = f"{base}/guest/"\n'
        '    onboard_url = f"{base}/guest/onboard/"\n'
        '    return Response(\n'
        '        content=(\n'
        '            f\'window.HUB_BASE_URL="{base}";\\n\'\n'
        '            f\'window.GUEST_PAGE_URL="{guest_url}";\\n\'\n'
        '            f\'window.ONBOARD_PAGE_URL="{onboard_url}";\\n\'\n'
        "        ),\n"
    )
    if old not in text:
        return False
    path.write_text(text.replace(old, new, 1))
    return True


def main() -> int:
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tv-hub")
    changed = False
    if patch_guest_launcher(dest / "backend/guest_launcher.py"):
        print("==> Patched guest_launcher.py package + APK path")
        changed = True
    if patch_main_hub_config(dest / "backend/main.py"):
        print("==> Patched main.py hub-config.js — ONBOARD_PAGE_URL")
        changed = True
    if patch_containerfile(dest / "Containerfile"):
        print("==> Patched Containerfile GUEST_LAUNCHER_APK")
        changed = True
    if not changed:
        print("==> Guest launcher package patches already applied (or files missing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
