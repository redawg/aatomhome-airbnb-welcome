"""Proxied Home Assistant Lovelace embed for guest TVs (hub holds HA token)."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from . import ha_bridge, ha_dashboard, store
from .device_auth import resolve_tv_device
from .tv_agent_ws import hub_public_url

logger = logging.getLogger("aatomhome.ha_dashboard_routes")
router = APIRouter(tags=["aatomhome-ha-dashboard"])

_HOP_BY_HOP = frozenset(
    {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"}
)


@router.get("/api/guest-welcome/ha-dashboard/embed-info")
async def ha_dashboard_embed_info(
    tv: dict[str, Any] = Depends(resolve_tv_device),
) -> dict[str, Any]:
    """Authenticated TV — Lovelace iframe URL via hub proxy."""
    device_id = int(tv["device_id"])
    room_config = await store.get_room_config(device_id)
    embed = await ha_dashboard.build_dashboard_embed(
        device_id,
        room_config,
        hub_public_url(),
    )
    return {"device_id": device_id, **embed}


def _rewrite_location(location: str, ha_url: str, proxy_prefix: str) -> str:
    ha_base = ha_url.rstrip("/")
    if location.startswith(ha_base):
        return proxy_prefix + location[len(ha_base) + 1 :]
    if location.startswith("/"):
        return proxy_prefix.rstrip("/") + location
    return location


@router.api_route(
    "/api/guest-welcome/ha-dashboard/p/{embed_token}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
async def ha_dashboard_http_proxy(
    embed_token: str,
    path: str,
    request: Request,
) -> Response:
    device_id = ha_dashboard.validate_embed_token(embed_token)
    if device_id is None:
        raise HTTPException(403, "Invalid or expired dashboard session")

    room_config = await store.get_room_config(device_id)
    if (room_config.get("dashboard_mode") or "cdo_str") != "ha_dashboard":
        raise HTTPException(403, "HA dashboard mode is not enabled for this room")

    try:
        ha_url, ha_token = await ha_bridge.ha_client()
    except ValueError as exc:
        raise HTTPException(503, str(exc))

    target = f"{ha_url.rstrip('/')}/{path}"
    if request.url.query:
        target = f"{target}?{request.url.query}"

    proxy_prefix = f"/api/guest-welcome/ha-dashboard/p/{embed_token}/"
    fwd_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP and k.lower() != "host"
    }
    fwd_headers["Authorization"] = f"Bearer {ha_token}"
    body = await request.body()

    try:
        async with httpx.AsyncClient(timeout=45.0, follow_redirects=False) as client:
            upstream = await client.request(
                request.method,
                target,
                headers=fwd_headers,
                content=body if body else None,
            )
    except httpx.HTTPError as exc:
        logger.warning("HA dashboard proxy error %s: %s", target, exc)
        raise HTTPException(502, "Could not reach Home Assistant")

    out_headers: dict[str, str] = {}
    for key, value in upstream.headers.items():
        lk = key.lower()
        if lk in ha_dashboard._STRIP_RESPONSE_HEADERS or lk in _HOP_BY_HOP:
            continue
        if lk == "location":
            out_headers[key] = _rewrite_location(value, ha_url, proxy_prefix)
            continue
        out_headers[key] = value

    content = upstream.content
    ctype = upstream.headers.get("content-type", "")
    if "text/html" in ctype.lower() and upstream.status_code < 400:
        try:
            html = upstream.text
            base_href = f"{proxy_prefix}{path.split('?', 1)[0]}"
            if not base_href.endswith("/"):
                base_href += "/"
            html = ha_dashboard.inject_proxy_html(
                html,
                base_href=base_href,
                ws_token=embed_token,
            )
            content = html.encode(upstream.encoding or "utf-8")
            out_headers.pop("content-length", None)
        except Exception as exc:
            logger.debug("HA dashboard HTML inject skipped: %s", exc)

    return Response(
        content=content,
        status_code=upstream.status_code,
        headers=out_headers,
        media_type=ctype or None,
    )


@router.websocket("/api/guest-welcome/ha-dashboard/socket/{embed_token}")
async def ha_dashboard_ws_proxy(embed_token: str, websocket: WebSocket) -> None:
    device_id = ha_dashboard.validate_embed_token(embed_token)
    if device_id is None:
        await websocket.close(code=4403)
        return

    room_config = await store.get_room_config(device_id)
    if (room_config.get("dashboard_mode") or "cdo_str") != "ha_dashboard":
        await websocket.close(code=4403)
        return

    try:
        ha_url, ha_token = await ha_bridge.ha_client()
    except ValueError:
        await websocket.close(code=1011)
        return

    ha_ws_url = ha_url.rstrip("/").replace("https://", "wss://").replace("http://", "ws://")
    ha_ws_url = f"{ha_ws_url}/api/websocket"

    await websocket.accept()
    try:
        import websockets

        async with websockets.connect(ha_ws_url, max_size=8 * 1024 * 1024) as upstream:
            await upstream.send(json.dumps({"type": "auth", "access_token": ha_token}))
            auth_raw = await upstream.recv()
            auth = json.loads(auth_raw)
            if auth.get("type") != "auth_ok":
                await websocket.close(code=1011)
                return

            async def guest_to_ha() -> None:
                try:
                    while True:
                        msg = await websocket.receive_text()
                        await upstream.send(msg)
                except WebSocketDisconnect:
                    pass

            async def ha_to_guest() -> None:
                try:
                    while True:
                        msg = await upstream.recv()
                        await websocket.send_text(msg)
                except websockets.ConnectionClosed:
                    pass

            await asyncio.gather(guest_to_ha(), ha_to_guest())
    except Exception as exc:
        logger.warning("HA dashboard websocket proxy ended: %s", exc)
        try:
            await websocket.close()
        except Exception:
            pass
