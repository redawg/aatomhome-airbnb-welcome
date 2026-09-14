"""Home Assistant REST bridge — hub holds the token; TVs never see it."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .setup_store import get_ha_config

logger = logging.getLogger("aatomhome.ha_bridge")


async def ha_client() -> tuple[str, str]:
    cfg = await get_ha_config()
    url = (cfg.get("ha_url") or "").strip().rstrip("/")
    token = (cfg.get("ha_token") or "").strip()
    if not url or not token:
        raise ValueError("Home Assistant is not configured on the hub")
    return url, token


async def get_state(entity_id: str) -> dict[str, Any]:
    url, token = await ha_client()
    entity = entity_id.strip()
    async with httpx.AsyncClient(timeout=12.0) as client:
        res = await client.get(
            f"{url}/api/states/{entity}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if res.status_code == 404:
        return {"entity_id": entity, "state": "unavailable"}
    if res.status_code >= 400:
        raise RuntimeError(f"HA state HTTP {res.status_code}")
    return res.json()


async def call_service(
    domain: str,
    service: str,
    entity_id: str,
    **data: Any,
) -> dict[str, Any]:
    url, token = await ha_client()
    payload: dict[str, Any] = {"entity_id": entity_id}
    payload.update(data)
    async with httpx.AsyncClient(timeout=12.0) as client:
        res = await client.post(
            f"{url}/api/services/{domain}/{service}",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
    if res.status_code >= 400:
        raise RuntimeError(f"HA service HTTP {res.status_code}")
    try:
        return res.json()
    except Exception:
        return {"ok": True}


def control_allowed(entity_id: str, controls: list[dict[str, Any]]) -> bool:
    allowed = {(c.get("entity_id") or "").strip() for c in controls}
    return entity_id.strip() in allowed and entity_id.strip()


_GUEST_CONTROL_DOMAINS = frozenset(
    {"switch", "light", "cover", "fan", "climate", "media_player", "input_boolean"}
)


async def list_guest_control_entities() -> list[dict[str, Any]]:
    """Controllable HA entities for room assignment (hub holds token)."""
    url, token = await ha_client()
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.get(
            f"{url}/api/states",
            headers={"Authorization": f"Bearer {token}"},
        )
    if res.status_code >= 400:
        raise RuntimeError(f"HA states HTTP {res.status_code}")
    rows: list[dict[str, Any]] = []
    for item in res.json():
        entity_id = (item.get("entity_id") or "").strip()
        if not entity_id or "." not in entity_id:
            continue
        domain = entity_id.split(".", 1)[0]
        if domain not in _GUEST_CONTROL_DOMAINS:
            continue
        attrs = item.get("attributes") or {}
        friendly = (attrs.get("friendly_name") or entity_id).strip()
        rows.append(
            {
                "entity_id": entity_id,
                "label": friendly,
                "domain": domain,
                "state": item.get("state") or "unknown",
                "area": (attrs.get("area_id") or attrs.get("area") or "").strip(),
            }
        )
    rows.sort(key=lambda r: (r.get("label") or r["entity_id"]).lower())
    return rows
