"""Canonical guest launcher package + APK paths (multi-site / generic branding)."""

GUEST_LAUNCHER_PACKAGE = "com.aatomhome.guestwelcome"
LEGACY_GUEST_LAUNCHER_PACKAGES = ("com.cielodeloro.guestwelcome",)
GUEST_LAUNCHER_APK_FILENAME = "aatomhome-guest-welcome.apk"
GUEST_LAUNCHER_APK_DEFAULT = f"/app/guest-launcher/{GUEST_LAUNCHER_APK_FILENAME}"
GUEST_ONBOARD_PATH = "/guest/onboard/"


def onboard_page_url(hub_url: str) -> str:
    return f"{hub_url.rstrip('/')}{GUEST_ONBOARD_PATH}"
