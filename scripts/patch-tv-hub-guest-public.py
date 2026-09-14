#!/usr/bin/env python3
"""Patch tv-hub so /guest/ loads config from the connected hub + property setup."""

from __future__ import annotations

import sys
from pathlib import Path


def patch_main_guest_public(main_path: Path) -> bool:
    text = main_path.read_text()
    marker = "from aatomhome.guest_public import enrich_public_config"
    if marker in text:
        return False

    if "import guest_welcome\n" in text and "aatomhome.guest_public" not in text:
        text = text.replace(
            "import guest_welcome\n",
            "import guest_welcome\n"
            "from aatomhome.guest_public import enrich_public_config, resolve_guest_public_context\n",
            1,
        )

    old = '''@app.get("/api/guest-welcome/public")
async def guest_welcome_public(request: Request, property_id: int = 1):
    """Public config for the TV welcome page (no auth)."""
    config = await _load_property_config(property_id)
    active_stay = await db.get_active_stay(property_id)
    all_devices = await db.list_devices()
    public = guest_welcome.build_public_config(
        config,
        HUB_PUBLIC_URL,
        enabled_packages=None,
        upload_dir=UPLOAD_DIR,
        active_stay=active_stay,
    )
    weather = await guest_welcome.get_weather_for_property(config, active_stay=active_stay)
    if weather:
        public["weather"] = weather
    device = await _device_for_client_request(request)
    if device:
        try:
            device_row, serial = await _registry_device_serial(device["id"])
            public["streaming_apps"] = await guest_welcome.enrich_streaming_apps_for_device(
                public.get("streaming_apps") or [],
                serial,
                device_row.get("owner_user_id") or guest_profile.MAIN_USER_ID,
            )
            public["tv_device_name"] = device_row.get("name")
        except HTTPException:
            pass
    return public'''

    new = '''@app.get("/api/guest-welcome/public")
async def guest_welcome_public(request: Request, property_id: int = 1):
    """Public config for the TV welcome page (no auth)."""
    ctx = await resolve_guest_public_context(request, property_id)
    property_id = ctx["property_id"]
    config = ctx.get("config") or {}
    active_stay = await db.get_active_stay(property_id)
    welcome = guest_welcome.merge_welcome(config)
    public = guest_welcome.build_public_config(
        config,
        HUB_PUBLIC_URL,
        enabled_packages=ctx.get("enabled_packages"),
        upload_dir=UPLOAD_DIR,
        active_stay=active_stay,
    )
    enrich_public_config(
        public,
        property_id=property_id,
        property_name=ctx.get("property_name") or "",
        guest_google_account=ctx.get("guest_google_account") or "",
        welcome=welcome,
        property_config=config,
        room_config=ctx.get("room_config"),
        device=ctx.get("device"),
    )
    weather = await guest_welcome.get_weather_for_property(config, active_stay=active_stay)
    if weather:
        public["weather"] = weather
    device = ctx.get("device") or await _device_for_client_request(request)
    if device:
        try:
            device_row, serial = await _registry_device_serial(device["id"])
            public["streaming_apps"] = await guest_welcome.enrich_streaming_apps_for_device(
                public.get("streaming_apps") or [],
                serial,
                device_row.get("owner_user_id") or guest_profile.MAIN_USER_ID,
            )
            public["tv_device_name"] = device_row.get("name")
            public["tv_device_id"] = device_row.get("id")
        except HTTPException:
            pass
    return public'''

    if old not in text:
        raise SystemExit(f"guest_welcome_public block not found in {main_path}")
    main_path.write_text(text.replace(old, new, 1))
    return True


def patch_default_welcome(guest_welcome_path: Path) -> bool:
    text = guest_welcome_path.read_text()
    if '"Welcome to Cielo del Oro"' not in text:
        return False
    text = text.replace('"title": "Welcome to Cielo del Oro"', '"title": "Welcome"', 1)
    text = text.replace(
        '"subtitle": "House info, WiFi, and local tips — press Google TV Apps when you\'re ready to watch"',
        '"subtitle": "House info, WiFi, and local tips — press Google TV Apps when you\'re ready to watch"',
        1,
    )
    text = text.replace('"tempest_station_id": 218440,', '"tempest_station_id": None,', 1)
    guest_welcome_path.write_text(text)
    return True


def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "tv-hub"
    main_py = root / "backend" / "main.py"
    gw_py = root / "backend" / "guest_welcome.py"
    if not main_py.is_file():
        raise SystemExit(f"tv-hub not found at {root}")

    changed = False
    if patch_main_guest_public(main_py):
        print("==> Patched main.py guest_welcome_public")
        changed = True
    else:
        print("==> main.py guest public already patched")

    if gw_py.is_file() and patch_default_welcome(gw_py):
        print("==> Patched guest_welcome.py generic defaults")
        changed = True

    if not changed:
        print("==> Guest public patches already applied")


if __name__ == "__main__":
    main()
