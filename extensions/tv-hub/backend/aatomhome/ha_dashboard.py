"""Home Assistant Lovelace embed helpers — hub holds token; TV gets proxied iframe."""

from __future__ import annotations

import logging
import secrets
import time
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

from . import ha_bridge

logger = logging.getLogger("aatomhome.ha_dashboard")

_EMBED_TOKENS: dict[str, tuple[int, float]] = {}
_EMBED_TTL_SECONDS = 86_400  # 24h

_STRIP_RESPONSE_HEADERS = frozenset(
    {
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "transfer-encoding",
        "connection",
    }
)


def issue_embed_token(device_id: int) -> str:
    token = secrets.token_urlsafe(18)
    _EMBED_TOKENS[token] = (device_id, time.time() + _EMBED_TTL_SECONDS)
    return token


def validate_embed_token(token: str) -> int | None:
    row = _EMBED_TOKENS.get((token or "").strip())
    if not row:
        return None
    device_id, expires_at = row
    if time.time() > expires_at:
        _EMBED_TOKENS.pop(token, None)
        return None
    return device_id


def ha_lovelace_path(ha_dashboard_url: str) -> str:
    """Path (+ optional query) on the HA host, e.g. lovelace/living-room."""
    field = (ha_dashboard_url or "").strip()
    if not field:
        return "lovelace/default_view"
    if field.startswith("http://") or field.startswith("https://"):
        parsed = urlparse(field)
        path = (parsed.path or "/lovelace/default_view").lstrip("/")
        if parsed.query:
            return f"{path}?{parsed.query}"
        return path
    return field.lstrip("/")


def with_sidebar_hidden(path: str) -> str:
    if "sidebar=" in path:
        return path
    sep = "&" if "?" in path else "?"
    return f"{path}{sep}sidebar=hide"


def inject_proxy_html(html: str, *, base_href: str, ws_token: str) -> str:
    inject = (
        f'<base href="{base_href}">'
        f"<script>(function(){{"
        f'var t="{ws_token}";var p=location.protocol==="https:"?"wss:":"ws:";'
        f"var O=window.WebSocket;window.WebSocket=function(u,pr){{"
        f'if(typeof u==="string"&&(u.indexOf("/api/websocket")>=0||u.indexOf("websocket")>=0)){{'
        f'u=p+"//"+location.host+"/api/guest-welcome/ha-dashboard/socket/"+t;}}'
        f"return new O(u,pr);}};}})();</script>"
    )
    lower = html.lower()
    head_idx = lower.find("<head>")
    if head_idx >= 0:
        insert_at = head_idx + len("<head>")
        return html[:insert_at] + inject + html[insert_at:]
    return inject + html


async def build_dashboard_embed(
    device_id: int,
    room_config: dict[str, Any],
    hub_public_url: str,
) -> dict[str, Any]:
    """URLs for guest TV Lovelace embed (proxy keeps HA token on hub)."""
    mode = (room_config.get("dashboard_mode") or "cdo_str").strip()
    if mode != "ha_dashboard":
        return {
            "ha_dashboard_iframe_src": None,
            "ha_dashboard_direct_src": None,
            "ha_dashboard_configured": False,
        }
    try:
        ha_url, _token = await ha_bridge.ha_client()
    except ValueError:
        return {
            "ha_dashboard_iframe_src": None,
            "ha_dashboard_direct_src": None,
            "ha_dashboard_configured": False,
            "ha_dashboard_error": "Home Assistant is not configured on the hub",
        }

    path = with_sidebar_hidden(ha_lovelace_path(room_config.get("ha_dashboard_url") or ""))
    embed_token = issue_embed_token(device_id)
    hub = hub_public_url.rstrip("/")
    proxy_prefix = f"{hub}/api/guest-welcome/ha-dashboard/p/{embed_token}/"
    iframe_src = f"{proxy_prefix}{path}"
    direct_src = f"{ha_url.rstrip('/')}/{path}"
    return {
        "ha_dashboard_iframe_src": iframe_src,
        "ha_dashboard_direct_src": direct_src,
        "ha_dashboard_configured": True,
        "ha_dashboard_path": path,
    }
