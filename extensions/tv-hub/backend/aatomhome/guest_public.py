"""Guest welcome public page — resolve property + hub setup for /guest/."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Request

import database as db
from guest_account_resolve import guest_account_from_config

from .setup_store import get_setting

logger = logging.getLogger("aatomhome.guest_public")


def _client_host(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


async def resolve_guest_public_context(
    request: Request,
    property_id_param: int = 1,
) -> dict[str, Any]:
    """
    Pick which property config the TV welcome page should show.

    Priority: registered TV (client IP) → explicit query param → hub Setup active property.
    """
    device: dict | None = None
    host = _client_host(request)
    if host:
        device = await db.get_device_by_host(host)
        if device:
            logger.debug("guest public: matched device id=%s host=%s", device.get("id"), host)

    property_id = property_id_param
    if device and device.get("property_id"):
        property_id = int(device["property_id"])
    elif property_id_param == 1:
        try:
            property_id = max(1, int((await get_setting("active_property_id", "1")).strip()))
        except ValueError:
            property_id = 1

    prop = await db.get_property(property_id)
    config = (prop or {}).get("config") or {}
    setup_property_name = (await get_setting("property_name")) or ""
    property_name = (prop or {}).get("name") or setup_property_name or f"Property {property_id}"
    guest_google_account = guest_account_from_config(config)

    enabled_packages: list[str] | None = None
    if device:
        parsed = db.parse_streaming_enabled(device)
        if parsed:
            enabled_packages = parsed

    return {
        "property_id": property_id,
        "property_name": property_name,
        "setup_property_name": setup_property_name,
        "guest_google_account": guest_google_account,
        "config": config,
        "device": device,
        "enabled_packages": enabled_packages,
    }


def property_map_from_welcome(
    welcome: dict,
    property_config: dict | None,
    property_name: str = "",
) -> dict[str, Any]:
    """Map pin for guest UI — from hub welcome/setup, not hardcoded estate defaults."""
    from local_trails import property_map_public as legacy_fallback

    welcome = welcome or {}
    cfg = property_config or {}
    lat = welcome.get("weather_lat")
    lon = welcome.get("weather_lon")
    if lat is None:
        lat = cfg.get("weather_lat")
    if lon is None:
        lon = cfg.get("weather_lon")

    label = (
        (welcome.get("weather_location_name") or "").strip()
        or property_name.strip()
        or (welcome.get("title") or "").strip()
        or "Property"
    )

    try:
        lat_f = float(lat) if lat is not None else None
        lon_f = float(lon) if lon is not None else None
    except (TypeError, ValueError):
        lat_f, lon_f = None, None

    if lat_f is not None and lon_f is not None:
        return {
            "lat": lat_f,
            "lon": lon_f,
            "label": label,
            "address": label,
        }

    fallback = legacy_fallback()
    if property_name and fallback.get("label") != property_name:
        fallback = {**fallback, "label": property_name, "address": property_name}
    return fallback


def enrich_public_config(
    public: dict[str, Any],
    *,
    property_id: int,
    property_name: str,
    guest_google_account: str,
    welcome: dict,
    property_config: dict | None,
) -> dict[str, Any]:
    public["property_id"] = property_id
    public["property_name"] = property_name
    public["guest_google_account"] = guest_google_account
    public["property_map"] = property_map_from_welcome(welcome, property_config, property_name)
    return public
