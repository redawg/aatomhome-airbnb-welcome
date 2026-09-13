"""Setup & settings API — Home Assistant, TVs, hub status."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import database as db
from . import store
from .setup_store import get_ha_config, get_setting, save_ha_config, set_setting
from .launcher_routes import _apk_info, hub_onboarding_url
from .tv_agent_ws import hub_public_url

logger = logging.getLogger("aatomhome.setup")
router = APIRouter(tags=["aatomhome-setup"])


class HaConfigBody(BaseModel):
    ha_url: str = Field(..., min_length=4, description="Home Assistant base URL")
    ha_token: str | None = Field(
        default=None,
        description="Long-lived access token; omit to keep existing token",
    )


class HaTestBody(BaseModel):
    ha_url: str | None = None
    ha_token: str | None = None


async def _test_ha(url: str, token: str) -> dict[str, Any]:
    if not url:
        return {"ok": False, "error": "Home Assistant URL is not set"}
    if not token:
        return {"ok": False, "error": "Long-lived access token is not set"}
    test_url = f"{url.rstrip('/')}/api/config"
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            res = await client.get(
                test_url,
                headers={"Authorization": f"Bearer {token}"},
            )
        if res.status_code == 401:
            return {"ok": False, "error": "Unauthorized — check your long-lived token"}
        if res.status_code >= 400:
            return {"ok": False, "error": f"HTTP {res.status_code} from Home Assistant"}
        data = res.json()
        return {
            "ok": True,
            "location_name": data.get("location_name"),
            "version": data.get("version"),
        }
    except httpx.ConnectError:
        return {"ok": False, "error": "Cannot reach Home Assistant — check URL and network"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Home Assistant timed out"}
    except Exception as exc:
        logger.exception("HA test failed")
        return {"ok": False, "error": str(exc)}


async def _tv_summary() -> dict[str, Any]:
    devices = await db.list_devices()
    online = sum(1 for d in devices if d.get("connection_state") == "device")
    pending = await store.list_pending_devices()
    claimed = 0
    app_slots = 0
    enriched = []
    for d in devices:
        meta = await store.get_meta(d["id"])
        reg_status = meta.get("registration_status", "active")
        if reg_status == "claimed":
            claimed += 1
        host = d.get("host") or ""
        is_app_slot = host in ("0.0.0.0", "pending", "")
        if is_app_slot and reg_status != "claimed":
            app_slots += 1
        enriched.append(
            {
                "id": d["id"],
                "name": d.get("name"),
                "host": d.get("host"),
                "port": d.get("port"),
                "connection_state": d.get("connection_state") or "offline",
                "registration_status": reg_status,
                "provision_mode": "app" if is_app_slot else "adb",
                "claim_code": meta.get("claim_code"),
            }
        )
    return {
        "registered": len(devices),
        "online": online,
        "claimed": claimed,
        "app_slots_unclaimed": app_slots,
        "pending": len(pending),
        "devices": enriched,
        "pending_devices": pending,
    }


def _provisioning_paths(hub_url: str) -> list[dict[str, Any]]:
    apk_url = f"{hub_url}/api/aatomhome/guest-launcher/apk"
    return [
        {
            "id": "app",
            "title": "Path 1 — Download app",
            "recommended": True,
            "summary": "No developer options on the TV. Download the launcher, enter the hub URL, claim with a room code.",
            "steps": [
                "On hub Setup: create a room slot and copy the room code (or let the TV self-register).",
                f"On the TV: install the APK from {apk_url}",
                f"Launch the app → Hub URL: {hub_url}",
                "Enter the room code → Claim — welcome screen loads from the hub.",
            ],
            "requires_adb": False,
        },
        {
            "id": "adb",
            "title": "Path 2 — Hub pushes via ADB",
            "recommended": False,
            "summary": "Developer options + wireless/network debugging. Hub installs the APK and can set Home, streaming apps, and lockdown.",
            "steps": [
                "On the TV: enable Developer options → Wireless or Network debugging.",
                "On hub: Register TV (IP + pair) → Connect → Provision New TV.",
                "Optional: still use room code in the launcher if you prefer HTTP claim after install.",
            ],
            "requires_adb": True,
        },
    ]


def _checklist(ha_cfg: dict[str, str], ha_test: dict[str, Any], tvs: dict[str, Any]) -> list[dict[str, Any]]:
    hub_url = hub_public_url()
    items: list[dict[str, Any]] = [
        {
            "id": "hub",
            "label": "TV hub is running",
            "status": "ok",
            "detail": hub_url,
            "path": "both",
        },
        {
            "id": "launcher_apk",
            "label": "Guest launcher APK served",
            "status": "ok",
            "detail": f"{hub_url}/api/aatomhome/guest-launcher/apk",
            "path": "app",
        },
        {
            "id": "tv_slot_or_claimed",
            "label": "TV room slot or claimed TV",
            "status": "ok" if tvs.get("registered") or tvs.get("claimed") else "todo",
            "detail": (
                f"{tvs.get('claimed', 0)} claimed · {tvs.get('registered', 0)} slots"
                if tvs.get("registered")
                else "Path 1: create room slot · Path 2: register for ADB · or self-register on TV"
            ),
            "path": "app",
        },
        {
            "id": "tv_claimed",
            "label": "At least one TV claimed (launcher)",
            "status": "ok" if tvs.get("claimed") else ("warn" if tvs.get("registered") else "todo"),
            "detail": f"{tvs.get('claimed', 0)} claimed via app",
            "path": "app",
        },
        {
            "id": "tv_online",
            "label": "TV on ADB (Path 2 only)",
            "status": "ok" if tvs.get("online") else "todo",
            "detail": (
                f"{tvs.get('online', 0)} online — optional unless using hub push / lockdown"
                if not tvs.get("online")
                else f"{tvs.get('online', 0)} online"
            ),
            "path": "adb",
        },
        {
            "id": "ha_url",
            "label": "Home Assistant URL configured",
            "status": "ok" if ha_cfg.get("ha_url") else "todo",
            "detail": ha_cfg.get("ha_url") or "Enter your HA URL below",
            "path": "both",
        },
        {
            "id": "ha_token",
            "label": "Home Assistant token saved",
            "status": "ok" if ha_cfg.get("ha_token") else "todo",
            "detail": "Create a long-lived token in HA → Profile → Security",
            "path": "both",
        },
        {
            "id": "ha_connect",
            "label": "Home Assistant reachable",
            "status": "ok" if ha_test.get("ok") else ("warn" if ha_cfg.get("ha_url") else "todo"),
            "detail": (
                f"{ha_test.get('location_name')} ({ha_test.get('version')})"
                if ha_test.get("ok")
                else ha_test.get("error", "Run Test connection")
            ),
            "path": "both",
        },
        {
            "id": "ha_integration",
            "label": "HA integration added",
            "status": "warn",
            "detail": "In HA: Settings → Devices → Add integration → Aatomhome Airbnb Welcome",
            "path": "both",
        },
    ]
    if tvs.get("pending"):
        items.append(
            {
                "id": "tv_pending",
                "label": "Pending TV approvals (self-register)",
                "status": "warn",
                "detail": f"{tvs['pending']} waiting for approval",
                "path": "app",
            }
        )
    return items


@router.get("/api/aatomhome/setup")
async def get_setup_status() -> dict[str, Any]:
    ha_cfg = await get_ha_config()
    ha_test = await _test_ha(ha_cfg["ha_url"], ha_cfg["ha_token"]) if ha_cfg["ha_url"] and ha_cfg["ha_token"] else {"ok": False}
    tvs = await _tv_summary()
    hub_url = hub_public_url()
    property_name = (await get_setting("property_name")) or os.environ.get("PROPERTY_NAME", "My property")
    return {
        "hub": {
            "public_url": hub_url,
            "guest_url": f"{hub_url}/guest/",
            "admin_url": hub_url,
            "property_name": property_name,
        },
        "homeassistant": {
            "ha_url": ha_cfg["ha_url"],
            "token_configured": bool(ha_cfg["ha_token"]),
            "token_preview": _token_preview(ha_cfg["ha_token"]),
            "connected": ha_test.get("ok") if ha_cfg["ha_token"] else None,
            "location_name": ha_test.get("location_name"),
            "version": ha_test.get("version"),
            "last_error": ha_test.get("error") if not ha_test.get("ok") else None,
        },
        "tvs": tvs,
        "provisioning_paths": _provisioning_paths(hub_url),
        "checklist": _checklist(ha_cfg, ha_test, tvs),
        "integration": {
            "name": "Aatomhome Airbnb Welcome",
            "repo": "https://github.com/redawg/aatomhome-airbnb-welcome",
            "hub_url_hint": hub_url,
            "docs": "https://github.com/redawg/aatomhome-airbnb-welcome/blob/main/docs/HACS.md",
        },
        "guest_launcher": {
            **_apk_info(),
            "hub_url": hub_onboarding_url(),
            "download_url": f"{hub_url}/api/aatomhome/guest-launcher/apk",
            "qr_url": f"{hub_url}/api/aatomhome/guest-launcher/hub-qr.png",
            "provisioning_doc": "https://github.com/redawg/aatomhome-airbnb-welcome/blob/main/docs/TV-PROVISIONING.md",
            "deploy_launcher_api": f"{hub_url}/api/aatomhome/registry/{{device_id}}/deploy-launcher",
            "deploy_launcher_bulk_api": f"{hub_url}/api/aatomhome/registry/deploy-launcher",
        },
    }


def _token_preview(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 8:
        return "••••"
    return f"••••{token[-4:]}"


@router.put("/api/aatomhome/setup/homeassistant")
async def put_ha_config(body: HaConfigBody) -> dict[str, Any]:
    saved = await save_ha_config(ha_url=body.ha_url)
    if body.ha_token:
        saved = await save_ha_config(ha_token=body.ha_token)
    test = await _test_ha(
        saved["ha_url"],
        (await get_ha_config())["ha_token"],
    )
    return {"ok": True, **saved, "test": test}


@router.post("/api/aatomhome/setup/homeassistant/test")
async def post_ha_test(body: HaTestBody | None = None) -> dict[str, Any]:
    cfg = await get_ha_config()
    url = (body.ha_url if body and body.ha_url else cfg["ha_url"]).strip().rstrip("/")
    token = (body.ha_token if body and body.ha_token else cfg["ha_token"]).strip()
    if not url:
        raise HTTPException(400, "Home Assistant URL is required")
    if not token:
        raise HTTPException(400, "Long-lived access token is required")
    result = await _test_ha(url, token)
    return result


class PropertyNameBody(BaseModel):
    property_name: str = Field(..., min_length=1, max_length=120)


@router.put("/api/aatomhome/setup/property")
async def put_property_name(body: PropertyNameBody) -> dict[str, Any]:
    await set_setting("property_name", body.property_name.strip())
    return {"ok": True, "property_name": body.property_name.strip()}
