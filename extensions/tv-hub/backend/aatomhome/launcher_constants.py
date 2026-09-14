"""Canonical guest launcher package + APK paths (multi-site / generic branding)."""

GUEST_LAUNCHER_PACKAGE = "com.aatomhome.guestwelcome"
LEGACY_GUEST_LAUNCHER_PACKAGES = ("com.cielodeloro.guestwelcome",)
GUEST_LAUNCHER_APK_FILENAME = "aatomhome-guest-welcome.apk"
GUEST_LAUNCHER_APK_DEFAULT = f"/app/guest-launcher/{GUEST_LAUNCHER_APK_FILENAME}"
GUEST_ONBOARD_PATH = "/guest/onboard/"


def normalize_hub_base(hub_url: str) -> str:
    """Strip guest/onboard path suffixes so callers can safely append GUEST_ONBOARD_PATH."""
    base = hub_url.rstrip("/")
    for suffix in (GUEST_ONBOARD_PATH.rstrip("/"), "/guest"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    return base.rstrip("/")


def onboard_page_url(hub_url: str) -> str:
    return f"{normalize_hub_base(hub_url)}{GUEST_ONBOARD_PATH}"
