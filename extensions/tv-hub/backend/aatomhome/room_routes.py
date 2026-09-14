"""Room screen API — authenticated TV fetches room config + HA control states."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import ha_bridge, store
from .device_auth import resolve_tv_device
from .ha_dashboard import build_dashboard_embed
from .tv_agent_ws import hub_public_url

logger = logging.getLogger("aatomhome.room")
router = APIRouter(tags=["aatomhome-room"])


class RoomControlBody(BaseModel):
    entity_id: str = Field(..., min_length=3)
    action: str = Field(default="toggle", description="toggle | on | off | open | close")


async def _control_states(controls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    states: list[dict[str, Any]] = []
    for ctrl in controls:
        entity_id = (ctrl.get("entity_id") or "").strip()
        if not entity_id:
            continue
        item = {
            "label": ctrl.get("label") or entity_id,
            "entity_id": entity_id,
            "type": ctrl.get("type") or "toggle",
            "state": "unavailable",
        }
        try:
            ha_state = await ha_bridge.get_state(entity_id)
            item["state"] = ha_state.get("state") or "unknown"
            attrs = ha_state.get("attributes") or {}
            if "brightness" in attrs:
                item["brightness"] = attrs.get("brightness")
        except Exception as exc:
            logger.debug("HA state for %s: %s", entity_id, exc)
        states.append(item)
    return states


@router.get("/api/guest-welcome/room")
async def guest_room_screen(
    tv: dict[str, Any] = Depends(resolve_tv_device),
) -> dict[str, Any]:
    """Room-specific config + live control states for this TV."""
    device_id = tv["device_id"]
    room_config = await store.get_room_config(device_id)
    controls = room_config.get("controls") or []
    control_states = await _control_states(controls) if controls else []
    room_name = (room_config.get("room_name") or "").strip()
    device = tv.get("device") or {}
    agent = store.tv_agent_meta(room_config)
    embed = await build_dashboard_embed(device_id, room_config, hub_public_url())
    return {
        "device_id": device_id,
        "room_name": room_name,
        "room_config": room_config,
        "controls": control_states,
        "tv_device_name": device.get("name"),
        "wifi_ssid": (agent.get("wifi_ssid") or "").strip(),
        "tv_local_ip": (agent.get("local_ip") or "").strip(),
        "welcome_overrides": room_config.get("welcome_overrides") or {},
        **embed,
    }


@router.post("/api/guest-welcome/room-control")
async def guest_room_control(
    body: RoomControlBody,
    tv: dict[str, Any] = Depends(resolve_tv_device),
) -> dict[str, Any]:
    """Toggle or set a whitelisted HA entity for this room."""
    device_id = tv["device_id"]
    room_config = await store.get_room_config(device_id)
    controls = room_config.get("controls") or []
    entity_id = body.entity_id.strip()
    if not ha_bridge.control_allowed(entity_id, controls):
        raise HTTPException(403, "Control not allowed for this room")

    ctrl = next((c for c in controls if (c.get("entity_id") or "").strip() == entity_id), {})
    domain = entity_id.split(".", 1)[0] if "." in entity_id else "switch"
    action = (body.action or "toggle").strip().lower()

    try:
        if action == "toggle":
            state = await ha_bridge.get_state(entity_id)
            current = (state.get("state") or "off").lower()
            if domain == "cover":
                service = "close_cover" if current == "open" else "open_cover"
            elif domain == "light":
                service = "turn_off" if current == "on" else "turn_on"
            else:
                service = "turn_off" if current == "on" else "turn_on"
            await ha_bridge.call_service(domain, service, entity_id)
        elif action in ("on", "open"):
            service = "open_cover" if domain == "cover" else "turn_on"
            await ha_bridge.call_service(domain, service, entity_id)
        elif action in ("off", "close"):
            service = "close_cover" if domain == "cover" else "turn_off"
            await ha_bridge.call_service(domain, service, entity_id)
        else:
            raise HTTPException(400, f"Unknown action: {action}")
    except ValueError as exc:
        raise HTTPException(503, str(exc))
    except RuntimeError as exc:
        raise HTTPException(502, str(exc))

    updated = await ha_bridge.get_state(entity_id)
    return {
        "ok": True,
        "entity_id": entity_id,
        "state": updated.get("state"),
    }
