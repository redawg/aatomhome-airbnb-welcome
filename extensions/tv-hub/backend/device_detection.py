"""Detect TV hardware — Google TV, Android TV, NVIDIA Shield, etc."""

from __future__ import annotations

import logging
from typing import Any

import adb

logger = logging.getLogger("adb-tv-hub")

LAUNCHERX = "com.google.android.apps.tv.launcherx"

GOOGLE_TV_STREAMER_DEVICES = frozenset({
    "kirkwood",
    "wembley",
    "boreal",
    "p13",
})

NVIDIA_SHIELD_DEVICES = frozenset({
    "foster",
    "darcy",
    "mdarcy",
    "sif",
    "myna",
    "model",
})

NVIDIA_SHIELD_MANUFACTURERS = frozenset({"nvidia"})

OEM_ANDROID_TV_HINTS = frozenset({
    "philips",
    "sony",
    "tcl",
    "hisense",
    "skyworth",
    "sharp",
    "vestel",
    "changhong",
})

DEVICE_TYPE_LABELS = {
    "google_tv_streamer": "Google TV Streamer",
    "google_tv": "Google TV",
    "nvidia_shield": "NVIDIA Shield",
    "android_tv": "Android TV",
    "unknown": "Unknown TV",
}


async def _package_installed(serial: str, package: str) -> bool:
    result = await adb.shell(serial, f"pm path {package}")
    return result.ok and package in (result.stdout or "")


def classify(
    *,
    product_device: str,
    manufacturer: str,
    brand: str,
    has_launcherx: bool,
) -> str:
    if product_device in GOOGLE_TV_STREAMER_DEVICES:
        return "google_tv_streamer"
    if (
        product_device in NVIDIA_SHIELD_DEVICES
        or manufacturer in NVIDIA_SHIELD_MANUFACTURERS
        or brand in NVIDIA_SHIELD_MANUFACTURERS
    ):
        return "nvidia_shield"
    if manufacturer in OEM_ANDROID_TV_HINTS or brand in OEM_ANDROID_TV_HINTS:
        return "android_tv"
    if has_launcherx:
        return "google_tv"
    if "google" in manufacturer or "google" in brand:
        return "google_tv"
    if product_device:
        return "android_tv"
    return "unknown"


def build_profile(
    *,
    device_type: str,
    product_device: str,
    product_model: str,
    product_manufacturer: str,
    has_launcherx: bool,
) -> dict[str, Any]:
    is_google = device_type in ("google_tv_streamer", "google_tv")
    is_streamer = device_type == "google_tv_streamer"
    is_android_tv = device_type == "android_tv"
    is_shield = device_type == "nvidia_shield"

    capabilities = {
        "apps_only_mode": is_google,
        "restore_google_tv": is_google and has_launcherx,
        "restore_stock_home": True,
        "launcherx": has_launcherx,
        "wake_on_lan_recommended": is_android_tv or is_streamer or is_shield,
        "manual_home_picker_likely": is_android_tv or is_shield,
        "picture_energy_mode_note": is_android_tv,
        "stock_screensaver_restore": is_google,
        "network_adb": is_shield,
    }

    manual_notes: list[str] = []
    if is_shield:
        manual_notes.extend([
            "Shield: enable Developer options → USB debugging + Network debugging.",
            "On first connect, approve the RSA fingerprint on the Shield (Always allow).",
            "Press Home → Guest Welcome → Always to set the guest launcher.",
            "Network ADB stays on after reboot when Network debugging is enabled.",
        ])
    elif is_android_tv:
        manual_notes.extend([
            "Press Home and choose Guest Welcome → Always if prompted "
            "(many Android TVs cannot set default home over ADB).",
            "For reliable wake-from-standby: set picture mode to Energy Saving and enable "
            "WoWLAN / network standby in the TV's network settings.",
        ])
    elif is_streamer:
        manual_notes.append(
            "After deploy, press Home and choose Guest Welcome → Always if prompted."
        )
    elif is_google:
        manual_notes.append(
            "Enable apps-only mode on the TV if needed. Press Home → Guest Welcome → Always."
        )

    return {
        "device_type": device_type,
        "device_type_label": DEVICE_TYPE_LABELS.get(device_type, "TV"),
        "product_device": product_device or None,
        "product_model": product_model or None,
        "product_manufacturer": product_manufacturer or None,
        "capabilities": capabilities,
        "manual_notes": manual_notes,
        "unified_goal": (
            "Same guest welcome, streaming apps, and wake-and-reset across all TVs — "
            "only hardware-specific setup steps differ."
        ),
    }


def profile_from_device(device: dict) -> dict[str, Any]:
    device_type = device.get("device_type") or "unknown"
    has_launcherx = bool(device.get("has_launcherx")) or device_type in (
        "google_tv_streamer",
        "google_tv",
    )
    return build_profile(
        device_type=device_type,
        product_device=(device.get("product_device") or "").lower(),
        product_model=device.get("product_model") or "",
        product_manufacturer=device.get("product_manufacturer") or "",
        has_launcherx=has_launcherx,
    )


async def detect_from_serial(serial: str) -> dict[str, Any]:
    info = await adb.get_device_info(serial)
    has_launcherx = await _package_installed(serial, LAUNCHERX)

    product_device = (info.get("product_device") or "").lower()
    manufacturer = (info.get("product_manufacturer") or "").lower()
    brand = (info.get("product_brand") or "").lower()
    model = info.get("product_model") or ""

    device_type = classify(
        product_device=product_device,
        manufacturer=manufacturer,
        brand=brand,
        has_launcherx=has_launcherx,
    )

    profile = build_profile(
        device_type=device_type,
        product_device=product_device,
        product_model=model,
        product_manufacturer=manufacturer or brand,
        has_launcherx=has_launcherx,
    )
    profile["has_launcherx"] = has_launcherx
    return profile


def needs_reclassify(device: dict) -> bool:
    """Re-run detection when stored type disagrees with known OEM hardware."""
    mfr = (device.get("product_manufacturer") or "").lower()
    dtype = device.get("device_type")
    if mfr in OEM_ANDROID_TV_HINTS and dtype in ("google_tv", "google_tv_streamer"):
        return True
    codename = (device.get("product_device") or "").lower()
    if codename in GOOGLE_TV_STREAMER_DEVICES and dtype != "google_tv_streamer":
        return True
    if (
        codename in NVIDIA_SHIELD_DEVICES
        or mfr in NVIDIA_SHIELD_MANUFACTURERS
    ) and dtype != "nvidia_shield":
        return True
    return not dtype


async def refresh_device_profile(device: dict, serial: str | None = None) -> dict[str, Any]:
    """Detect hardware over ADB and persist classification to the registry."""
    import database as db

    if not serial:
        serial = f"{device['host']}:{device['port']}"

    try:
        profile = await detect_from_serial(serial)
        await db.update_device(
            device["id"],
            device_type=profile["device_type"],
            product_device=profile.get("product_device"),
            product_model=profile.get("product_model"),
            product_manufacturer=profile.get("product_manufacturer"),
            has_launcherx=int(bool(profile.get("has_launcherx"))),
        )
        return profile
    except Exception:
        logger.exception("Device detection failed for %s", device.get("name"))
        return profile_from_device(device)
