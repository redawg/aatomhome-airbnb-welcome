"""Guest launcher APK download and onboarding QR."""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import os
from pathlib import Path
from typing import Any

import qrcode
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from .launcher_constants import (
    GUEST_LAUNCHER_APK_DEFAULT,
    GUEST_LAUNCHER_APK_FILENAME,
    GUEST_LAUNCHER_PACKAGE,
    onboard_page_url,
)
from .tv_agent_ws import hub_public_url

logger = logging.getLogger("aatomhome.launcher")
router = APIRouter(tags=["aatomhome-launcher"])

GUEST_LAUNCHER_APK = Path(os.environ.get("GUEST_LAUNCHER_APK", GUEST_LAUNCHER_APK_DEFAULT))


def _apk_info() -> dict[str, Any]:
    if not GUEST_LAUNCHER_APK.is_file():
        return {
            "available": False,
            "path": str(GUEST_LAUNCHER_APK),
            "package": GUEST_LAUNCHER_PACKAGE,
        }
    data = GUEST_LAUNCHER_APK.read_bytes()
    return {
        "available": True,
        "path": str(GUEST_LAUNCHER_APK),
        "package": GUEST_LAUNCHER_PACKAGE,
        "filename": GUEST_LAUNCHER_APK_FILENAME,
        "size_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def hub_onboarding_url() -> str:
    return onboard_page_url(hub_public_url())


def make_hub_qr_png(url: str | None = None) -> bytes:
    payload = (url or hub_onboarding_url()).strip()
    qr = qrcode.QRCode(version=None, box_size=6, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@router.get("/api/aatomhome/guest-launcher/info")
async def guest_launcher_info() -> dict[str, Any]:
    hub = hub_onboarding_url()
    info = _apk_info()
    base = hub_public_url().rstrip("/")
    return {
        "hub_url": base,
        "guest_url": f"{base}/guest/",
        "onboard_url": hub,
        "download_url": f"{base}/api/aatomhome/guest-launcher/apk",
        "package": GUEST_LAUNCHER_PACKAGE,
        "onboarding": {
            "manual_url_entry": hub,
            "qr_payload": hub,
            "claim_api": f"{base}/api/registry/claim-by-code",
            "self_register_api": f"{base}/api/registry/self-register",
        },
        **info,
    }


@router.get("/api/aatomhome/guest-launcher/apk")
async def download_guest_launcher_apk():
    if not GUEST_LAUNCHER_APK.is_file():
        raise HTTPException(404, "Guest launcher APK is not bundled with this hub")
    info = _apk_info()
    return FileResponse(
        GUEST_LAUNCHER_APK,
        media_type="application/vnd.android.package-archive",
        filename=info.get("filename", "aatomhome-guest-welcome.apk"),
        headers={
            "X-SHA256": info.get("sha256", ""),
            "Cache-Control": "public, max-age=300",
        },
    )


@router.get("/api/aatomhome/guest-launcher/hub-qr.png")
async def hub_qr_png():
    return Response(
        content=make_hub_qr_png(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=60"},
    )


@router.get("/api/aatomhome/guest-launcher/hub-qr-data")
async def hub_qr_data() -> dict[str, Any]:
    url = hub_onboarding_url()
    png = make_hub_qr_png(url)
    return {
        "hub_url": url,
        "qr_payload": url,
        "qr_png_base64": base64.b64encode(png).decode("ascii"),
    }
