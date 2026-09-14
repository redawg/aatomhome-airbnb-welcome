"""Setup & settings API — Home Assistant, TVs, hub status."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import adb
import database as db
import guest_welcome
from . import store
from guest_account_resolve import guest_account_from_config, property_link_from_config

from . import ha_bridge
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
    live = {row["serial"]: row for row in await adb.list_devices()}
    pending = await store.list_pending_devices()
    claimed = 0
    app_slots = 0
    enriched = []
    online = 0
    for d in devices:
        meta = await store.get_meta(d["id"])
        if not meta.get("claim_code"):
            meta = await store.ensure_meta_for_device(d["id"])
        reg_status = meta.get("registration_status", "active")
        if reg_status == "claimed":
            claimed += 1
        host = d.get("host") or ""
        is_app_slot = host in ("0.0.0.0", "pending", "")
        if is_app_slot and reg_status != "claimed":
            app_slots += 1
        live_info, _ = adb.match_live_device(d.get("host") or "", d.get("port") or 5555, live)
        connection_state = live_info.get("state", "offline")
        status = await store.room_api_status(d["id"], connection_state)
        if status.get("adb_online"):
            online += 1
        room_cfg = store.parse_room_config(meta)
        room_name = (room_cfg.get("room_name") or "").strip()
        controls = room_cfg.get("controls") or []
        enriched.append(
            {
                "id": d["id"],
                "name": d.get("name"),
                "room_name": room_name,
                "host": d.get("host"),
                "port": d.get("port"),
                "connection_state": connection_state,
                "registration_status": reg_status,
                "provision_mode": "app" if is_app_slot else "adb",
                "claim_code": meta.get("claim_code"),
                "dashboard_mode": status["dashboard_mode"],
                "dashboard_type": status["dashboard_type"],
                "agent_connected": status["agent_connected"],
                "adb_online": status["adb_online"],
                "tv_local_ip": status.get("tv_local_ip") or "",
                "adb_setup_status": status.get("adb_setup_status") or "",
                "adb_setup_message": status.get("adb_setup_message") or "",
                "controls_count": len(controls),
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


def _guest_sign_in_info(guest_email: str) -> dict[str, Any]:
    try:
        from guest_profile import MAIN_USER_ID
    except ImportError:
        MAIN_USER_ID = 0
    profile_label = "Main profile (owner / primary user)"
    profile_short = f"Main profile · Android user {MAIN_USER_ID}"
    configured = bool(guest_email and "@" in guest_email)
    account_display = guest_email if configured else "(set in Setup → Hub → TV Google account)"
    return {
        "guest_google_account": guest_email,
        "android_user_id": MAIN_USER_ID,
        "profile_label": profile_label,
        "profile_short": profile_short,
        "configured": configured,
        "summary": (
            f"On each TV, sign in with {guest_email} on the {profile_label.lower()} "
            "before streaming apps or checkout login clearing."
            if configured
            else "Set the property TV Google account in Setup before provisioning streaming apps."
        ),
        "steps": [
            "On the TV: Settings → Accounts → add or switch to the primary Google profile (not a child profile).",
            f"Sign in with: {account_display}",
            "Use only this account on the main profile — extra accounts can confuse streaming sync.",
            "After sign-in: hub can push the welcome app, sync streaming apps, and clear logins between stays.",
        ],
    }


def _provisioning_paths(hub_url: str, guest_email: str = "") -> list[dict[str, Any]]:
    apk_url = f"{hub_url}/api/aatomhome/guest-launcher/apk"
    sign_in = _guest_sign_in_info(guest_email)
    account_step = (
        f"TV main profile: sign in with {guest_email} (Android user {sign_in['android_user_id']})."
        if sign_in["configured"]
        else "Hub Setup → set TV Google account, then sign in on the TV main profile."
    )
    return [
        {
            "id": "app",
            "title": "Path 1 — Download app",
            "recommended": True,
            "summary": "No developer options on the TV. Download the launcher, enter the hub URL, claim with a room code.",
            "steps": [
                "Hub Setup: confirm TV Google account for this property (see sign-in box above).",
                account_step,
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
                "Hub Setup: confirm TV Google account for this property (see sign-in box above).",
                account_step,
                "On the TV: enable Developer options → Wireless or Network debugging.",
                "On hub: Register TV (IP + pair) → Connect → Push welcome app.",
                "Guest Experience: Apply streaming apps · Clear streaming logins between stays.",
            ],
            "requires_adb": True,
        },
    ]


async def _active_property_id() -> int:
    raw = (await get_setting("active_property_id", "1")).strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 1


def _slugify_property_link(link: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (link or "").strip().lower()).strip("-")
    return slug or "property"


def _tempest_token_status(config: dict | None) -> dict[str, Any]:
    defaults = guest_welcome.get_welcome_defaults(config)
    token = (defaults.get("tempest_api_token") or "").strip()
    env_token = (os.environ.get("TEMPEST_API_TOKEN") or "").strip()
    active = token or env_token
    return {
        "tempest_api_token_configured": bool(active),
        "tempest_api_token_preview": _token_preview(active) if active else "",
        "tempest_token_source": "property" if token else ("env" if env_token else ""),
    }


def _property_location_fields(config: dict | None) -> dict[str, Any]:
    defaults = guest_welcome.get_welcome_defaults(config)
    lat = defaults.get("weather_lat")
    lon = defaults.get("weather_lon")
    station = defaults.get("tempest_station_id")
    return {
        "property_address": (defaults.get("property_address") or "").strip(),
        "weather_location_name": (defaults.get("weather_location_name") or "").strip(),
        "weather_lat": lat,
        "weather_lon": lon,
        "weather_coords_manual": bool(defaults.get("weather_coords_manual")),
        "tempest_station_id": station,
        **_tempest_token_status(config),
    }


async def _property_summaries() -> list[dict[str, Any]]:
    rows = []
    for prop in await db.list_properties():
        config = prop.get("config") or {}
        guest_email = guest_account_from_config(config)
        rows.append({
            "id": prop["id"],
            "name": prop.get("name") or f"Property {prop['id']}",
            "slug": prop.get("slug"),
            "property_link": property_link_from_config(config),
            "guest_google_account": guest_email,
            **_property_location_fields(config),
        })
    return rows


def _checklist(
    ha_cfg: dict[str, str],
    ha_test: dict[str, Any],
    tvs: dict[str, Any],
    guest_account: str = "",
) -> list[dict[str, Any]]:
    hub_url = hub_public_url()
    items: list[dict[str, Any]] = [
        {
            "id": "hub",
            "label": "Aatom Guest Welcome hub is running",
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
            "id": "guest_google_account",
            "label": "Guest Google account on main profile",
            "status": "ok" if guest_account else "todo",
            "detail": (
                f"{guest_account} · main profile (Android user 0)"
                if guest_account
                else "Set the Google account for the TV primary profile in Hub below"
            ),
            "path": "both",
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
    active_property_id = await _active_property_id()
    properties = await _property_summaries()
    active_prop = next((p for p in properties if p["id"] == active_property_id), properties[0] if properties else None)
    guest_account = (active_prop or {}).get("guest_google_account") or ""
    guest_sign_in = _guest_sign_in_info(guest_account)
    return {
        "hub": {
            "public_url": hub_url,
            "guest_url": f"{hub_url}/guest/",
            "onboard_url": f"{hub_url}/guest/onboard/",
            "admin_url": hub_url,
            "property_name": property_name,
            "active_property_id": active_property_id,
            "guest_google_account": guest_account,
            "guest_sign_in": guest_sign_in,
        },
        "guest_sign_in": guest_sign_in,
        "properties": properties,
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
        "provisioning_paths": _provisioning_paths(hub_url, guest_account),
        "checklist": _checklist(ha_cfg, ha_test, tvs, guest_account),
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


@router.get("/api/aatomhome/setup/homeassistant/entities")
async def list_ha_control_entities() -> dict[str, Any]:
    """Controllable HA entities for per-room assignment in Setup."""
    ha_cfg = await get_ha_config()
    if not ha_cfg["ha_url"] or not ha_cfg["ha_token"]:
        raise HTTPException(400, "Home Assistant is not configured — add URL and token in Setup → Integration")
    try:
        entities = await ha_bridge.list_guest_control_entities()
    except ValueError as exc:
        raise HTTPException(503, str(exc))
    except RuntimeError as exc:
        raise HTTPException(502, str(exc))
    return {"entities": entities, "count": len(entities)}


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


class ActivePropertyBody(BaseModel):
    property_id: int = Field(..., ge=1)


class GuestGoogleAccountBody(BaseModel):
    guest_google_account: str = Field(default="", max_length=200)


class PropertyLinkBody(BaseModel):
    property_link: str = Field(..., min_length=1, max_length=200)


class PropertyLocationBody(BaseModel):
    property_address: str | None = Field(default=None, max_length=240)
    weather_location_name: str | None = Field(default=None, max_length=120)
    weather_lat: float | None = None
    weather_lon: float | None = None
    weather_coords_manual: bool | None = Field(
        default=None,
        description="When true, keep submitted lat/lon; when false, geocode from address",
    )
    tempest_station_id: int | None = None
    tempest_api_token: str | None = Field(
        default=None,
        max_length=200,
        description="Tempest API token; omit or leave blank to keep saved token",
    )


class CreatePropertyBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    property_link: str = Field(..., min_length=1, max_length=200)
    guest_google_account: str = Field(default="", max_length=200)


@router.get("/api/aatomhome/properties")
async def list_properties_api() -> dict[str, Any]:
    active_property_id = await _active_property_id()
    return {
        "active_property_id": active_property_id,
        "properties": await _property_summaries(),
    }


@router.put("/api/aatomhome/setup/active-property")
async def put_active_property(body: ActivePropertyBody) -> dict[str, Any]:
    prop = await db.get_property(body.property_id)
    if not prop:
        raise HTTPException(404, "Property not found")
    await set_setting("active_property_id", str(body.property_id))
    guest_email = guest_account_from_config(prop.get("config"))
    return {
        "ok": True,
        "active_property_id": body.property_id,
        "property_name": prop.get("name"),
        "guest_google_account": guest_email,
    }


@router.put("/api/aatomhome/properties/{property_id}/guest-account")
async def put_property_guest_account(property_id: int, body: GuestGoogleAccountBody) -> dict[str, Any]:
    email = body.guest_google_account.strip()
    if email and "@" not in email:
        raise HTTPException(400, "TV Google account must be an email address, or leave blank")
    prop = await db.get_property(property_id)
    if not prop:
        raise HTTPException(404, "Property not found")
    config = dict(prop.get("config") or {})
    ge = dict(config.get("guest_experience") or {})
    ge["guest_google_account"] = email
    config["guest_experience"] = ge
    await db.update_property(property_id, config=config)
    return {
        "ok": True,
        "property_id": property_id,
        "guest_google_account": email,
    }


@router.get("/api/aatomhome/geocode")
async def geocode_property_address(address: str = "") -> dict[str, Any]:
    """Preview geocode for a property address (Setup UI)."""
    from geocode import geocode_address

    cleaned = (address or "").strip()
    if len(cleaned) < 5:
        raise HTTPException(400, "Enter a full street address to geocode")
    result = await geocode_address(cleaned)
    if not result:
        raise HTTPException(404, "Could not find coordinates for that address")
    return {"ok": True, **result}


@router.put("/api/aatomhome/properties/{property_id}/location")
async def put_property_location(property_id: int, body: PropertyLocationBody) -> dict[str, Any]:
    """Property address, forecast coordinates, and Tempest hyper-local weather."""
    from geocode import geocode_address

    prop = await db.get_property(property_id)
    if not prop:
        raise HTTPException(404, "Property not found")
    config = dict(prop.get("config") or {})
    defaults = dict(config.get("welcome_defaults") or guest_welcome.get_welcome_defaults(config))

    prev_address = (defaults.get("property_address") or "").strip()
    if body.property_address is not None:
        defaults["property_address"] = body.property_address.strip()
    if body.weather_location_name is not None:
        defaults["weather_location_name"] = body.weather_location_name.strip()

    address = (defaults.get("property_address") or "").strip()
    coords_manual = body.weather_coords_manual
    if coords_manual is None:
        coords_manual = bool(defaults.get("weather_coords_manual"))

    address_changed = address and address != prev_address
    should_geocode = address and not coords_manual and (address_changed or body.weather_lat is None or body.weather_lon is None)

    geocoded = None
    if should_geocode:
        geocoded = await geocode_address(address)
        if geocoded:
            defaults["weather_lat"] = geocoded["lat"]
            defaults["weather_lon"] = geocoded["lon"]
            defaults["weather_coords_manual"] = False
            if not (body.weather_location_name or "").strip() and geocoded.get("label"):
                defaults["weather_location_name"] = geocoded["label"]
        elif body.weather_lat is not None and body.weather_lon is not None:
            defaults["weather_lat"] = body.weather_lat
            defaults["weather_lon"] = body.weather_lon
            defaults["weather_coords_manual"] = True
    elif coords_manual and body.weather_lat is not None and body.weather_lon is not None:
        defaults["weather_lat"] = body.weather_lat
        defaults["weather_lon"] = body.weather_lon
        defaults["weather_coords_manual"] = True
    else:
        if body.weather_lat is not None:
            defaults["weather_lat"] = body.weather_lat
        if body.weather_lon is not None:
            defaults["weather_lon"] = body.weather_lon
    if body.tempest_station_id is not None:
        defaults["tempest_station_id"] = body.tempest_station_id if body.tempest_station_id > 0 else None
    if body.tempest_api_token is not None and body.tempest_api_token.strip():
        defaults["tempest_api_token"] = body.tempest_api_token.strip()

    config["welcome_defaults"] = defaults
    config["guest_content_revision"] = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    await db.update_property(property_id, config=config)

    location = _property_location_fields(config)
    return {"ok": True, "property_id": property_id, **location}


@router.put("/api/aatomhome/properties/{property_id}/property-link")
async def put_property_link(property_id: int, body: PropertyLinkBody) -> dict[str, Any]:
    """Free-form property key — HA config entry, slug, external ID, or any label."""
    link = body.property_link.strip()
    if not link:
        raise HTTPException(400, "Property link is required")
    prop = await db.get_property(property_id)
    if not prop:
        raise HTTPException(404, "Property not found")
    config = dict(prop.get("config") or {})
    ge = dict(config.get("guest_experience") or {})
    ge["property_link"] = link
    config["guest_experience"] = ge
    config["property_link"] = link
    await db.update_property(property_id, config=config)
    return {
        "ok": True,
        "property_id": property_id,
        "property_link": link,
    }


@router.post("/api/aatomhome/properties")
async def create_property_api(body: CreatePropertyBody) -> dict[str, Any]:
    """Add a rentable property — link key can be any string (HA name, slug, ID)."""
    name = body.name.strip()
    link = body.property_link.strip()
    slug = _slugify_property_link(link)
    if await db.get_property_by_slug(slug):
        raise HTTPException(409, f"Property link “{link}” is already in use (slug {slug})")
    ge: dict[str, Any] = {"property_link": link}
    email = body.guest_google_account.strip()
    if email:
        if "@" not in email:
            raise HTTPException(400, "TV Google account must be an email address, or leave blank")
        ge["guest_google_account"] = email
    config = {"guest_experience": ge, "property_link": link, "name": name, "slug": slug}
    property_id = await db.create_property(name, slug, config)
    await set_setting("active_property_id", str(property_id))
    return {
        "ok": True,
        "property_id": property_id,
        "name": name,
        "slug": slug,
        "property_link": link,
        "guest_google_account": email,
        "active_property_id": property_id,
    }


@router.get("/api/aatomhome/properties/by-link/{property_link:path}")
async def get_property_by_link(property_link: str) -> dict[str, Any]:
    """Resolve a property by free-form link key (for HA integration matching)."""
    needle = property_link.strip()
    if not needle:
        raise HTTPException(400, "property_link required")
    for prop in await db.list_properties():
        config = prop.get("config") or {}
        candidates = {
            property_link_from_config(config),
            (prop.get("slug") or "").strip(),
            str(prop.get("id")),
        }
        if needle in candidates or _slugify_property_link(needle) == (prop.get("slug") or ""):
            return {
                "property_id": prop["id"],
                "name": prop.get("name"),
                "slug": prop.get("slug"),
                "property_link": property_link_from_config(config),
            }
    raise HTTPException(404, "No property matches that link")
