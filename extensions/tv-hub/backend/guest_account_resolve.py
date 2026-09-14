"""Resolve per-property Google account for TV provisioning."""

from __future__ import annotations

import os

import database as db

DEFAULT_GUEST_GOOGLE_ACCOUNT = os.environ.get(
    "GUEST_GOOGLE_ACCOUNT",
    "guest@example.com",
)


def guest_account_from_config(config: dict | None) -> str:
    if not config:
        return DEFAULT_GUEST_GOOGLE_ACCOUNT
    ge = (config or {}).get("guest_experience") or {}
    acct = (ge.get("guest_google_account") or "").strip()
    return acct or DEFAULT_GUEST_GOOGLE_ACCOUNT


def property_link_from_config(config: dict | None) -> str:
    """Free-form key linking this hub property to HA, rooms, and external systems."""
    if not config:
        return ""
    ge = (config or {}).get("guest_experience") or {}
    link = (ge.get("property_link") or config.get("property_link") or config.get("slug") or "").strip()
    return link


async def resolve_guest_google_account(
    *,
    property_id: int | None = None,
    device: dict | None = None,
    serial: str | None = None,
    property_config: dict | None = None,
) -> str:
    if property_config is not None:
        return guest_account_from_config(property_config)
    if property_id:
        prop = await db.get_property(property_id)
        if prop:
            return guest_account_from_config(prop.get("config"))
    if device:
        pid = device.get("property_id")
        if pid:
            prop = await db.get_property(pid)
            if prop:
                return guest_account_from_config(prop.get("config"))
    if serial:
        for row in await db.list_devices():
            if row.get("serial") == serial:
                return await resolve_guest_google_account(device=row)
    return DEFAULT_GUEST_GOOGLE_ACCOUNT


async def property_id_for_serial(serial: str) -> int:
    for row in await db.list_devices():
        if row.get("serial") == serial:
            return int(row.get("property_id") or 1)
    return 1
