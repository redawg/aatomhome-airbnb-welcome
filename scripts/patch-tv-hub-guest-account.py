#!/usr/bin/env python3
"""Patch upstream tv-hub for per-property guest Google account messages."""

from __future__ import annotations

import re
import sys
from pathlib import Path


def patch_guest_launcher(path: Path) -> bool:
    text = path.read_text()
    marker = "guest_email = await guest_account_resolve.resolve_guest_google_account"
    if marker in text:
        return False

    needle = "async def setup_guest_tv(\n    serial: str,\n    device: dict,\n    property_config: dict | None,"
    if needle not in text:
        raise SystemExit(f"setup_guest_tv signature not found in {path}")

    insert = (
        '    guest_email = await guest_account_resolve.resolve_guest_google_account(\n'
        "        device=device, property_config=property_config\n"
        "    )\n"
    )
    text = text.replace(
        needle,
        needle,
        1,
    )
    # Insert after function docstring / steps init
    anchor = '    """Install guest launcher on the main TV profile and sync streaming apps."""\n    steps: list[dict] = []'
    if anchor not in text:
        raise SystemExit("setup_guest_tv body anchor not found")
    text = text.replace(anchor, anchor + "\n" + insert, 1)

    if "import guest_account_resolve\n" not in text:
        text = text.replace(
            "from guest_profile import (",
            "import guest_account_resolve\nfrom guest_profile import (",
            1,
        )

    replacements = [
        (
            'if not await has_guest_account_on_main(serial):\n        return {\n            "ok": False,\n            "message": f"Guest account not found on main profile — sign in with {GUEST_GOOGLE_ACCOUNT}",',
            'if not await has_guest_account_on_main(serial, guest_email):\n        return {\n            "ok": False,\n            "message": f"Guest account not found on main profile — sign in with {guest_email}",',
        ),
        (
            'f"On the TV: sign in with {GUEST_GOOGLE_ACCOUNT} as the main Google account",',
            'f"On the TV: sign in with {guest_email} as the main Google account",',
        ),
        (
            'f"Main profile uses {GUEST_GOOGLE_ACCOUNT}.",',
            'f"Main profile uses {guest_email}.",',
        ),
        (
            '"guest_google_account": GUEST_GOOGLE_ACCOUNT,',
            '"guest_google_account": guest_email,',
        ),
    ]
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f"guest_launcher patch block missing:\n{old[:80]}...")
        text = text.replace(old, new, 1)

    path.write_text(text)
    return True


def patch_streaming_apps(path: Path) -> bool:
    text = path.read_text()
    if "guest_account_resolve" in text:
        return False
    text = text.replace(
        "from guest_profile import GUEST_GOOGLE_ACCOUNT, MAIN_USER_ID, has_guest_account_on_main",
        "import guest_account_resolve\nfrom guest_profile import MAIN_USER_ID, has_guest_account_on_main",
        1,
    )
    old = 'note += f" — sign in with {GUEST_GOOGLE_ACCOUNT} on the TV"'
    new = (
        'guest_email = await guest_account_resolve.resolve_guest_google_account(serial=serial)\n'
        '            note += f" — sign in with {guest_email} on the TV"'
    )
    if old not in text:
        raise SystemExit("streaming_apps note patch anchor missing")
    text = text.replace(old, new, 1)
    path.write_text(text)
    return True


def patch_main_guest_experience_update(path: Path) -> bool:
    text = path.read_text()
    if "guest_google_account: str | None" in text:
        return False
    text = text.replace(
        "class GuestExperienceUpdate(BaseModel):\n    hide_play_store: bool | None = None",
        "class GuestExperienceUpdate(BaseModel):\n    guest_google_account: str | None = None\n    hide_play_store: bool | None = None",
        1,
    )
    path.write_text(text)
    return True


def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "tv-hub"
    backend = root / "backend"
    changed = []
    if patch_guest_launcher(backend / "guest_launcher.py"):
        changed.append("guest_launcher.py")
    if patch_streaming_apps(backend / "streaming_apps.py"):
        changed.append("streaming_apps.py")
    if patch_main_guest_experience_update(backend / "main.py"):
        changed.append("main.py GuestExperienceUpdate")
    if changed:
        print("Patched:", ", ".join(changed))
    else:
        print("Guest account patches already applied")


if __name__ == "__main__":
    main()
