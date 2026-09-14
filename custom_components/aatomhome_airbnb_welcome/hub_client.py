"""Async HTTP client for the adb-tv-hub API."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urljoin

import aiohttp

_LOGGER = logging.getLogger(__name__)


class TvHubError(Exception):
    """Base error for tv-hub API calls."""


class TvHubAuthError(TvHubError):
    """Authentication failed talking to tv-hub."""


class TvHubClient:
    """Thin wrapper around adb-tv-hub REST endpoints used by Phase 1."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        base_url: str,
        api_token: str | None = None,
    ) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._api_token = api_token

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self._api_token:
            headers["Authorization"] = f"Bearer {self._api_token}"
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        url = urljoin(f"{self._base_url}/", path.lstrip("/"))
        try:
            async with self._session.request(
                method,
                url,
                headers=self._headers(),
                params=params,
                json=json,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status in (401, 403):
                    raise TvHubAuthError(f"Hub rejected credentials ({resp.status})")
                if resp.status >= 400:
                    detail = await resp.text()
                    raise TvHubError(f"Hub {method} {path} failed ({resp.status}): {detail[:200]}")
                if resp.content_type == "application/json":
                    return await resp.json()
                return await resp.text()
        except aiohttp.ClientError as err:
            raise TvHubError(f"Hub request failed: {err}") from err

    async def get_health(self) -> dict[str, Any]:
        """Return /api/health payload."""
        result = await self._request("GET", "/api/health")
        if not isinstance(result, dict):
            raise TvHubError("Unexpected health response")
        return result

    async def get_registry(self) -> list[dict[str, Any]]:
        """Return registered TVs with live connection state."""
        result = await self._request("GET", "/api/registry")
        if not isinstance(result, list):
            raise TvHubError("Unexpected registry response")
        return result

    async def get_active_stay(self, property_id: int) -> dict[str, Any]:
        """Return active guest stay for the property."""
        result = await self._request(
            "GET",
            "/api/guest-stays/active",
            params={"property_id": property_id},
        )
        if not isinstance(result, dict):
            raise TvHubError("Unexpected guest-stays response")
        return result

    async def connect_all(self, property_id: int) -> dict[str, Any]:
        """Discover and connect all registered TVs."""
        result = await self._request(
            "POST",
            "/api/registry/connect-all",
            params={"property_id": property_id},
        )
        if not isinstance(result, dict):
            raise TvHubError("Unexpected connect-all response")
        return result

    async def connect_device(self, device_id: int) -> dict[str, Any]:
        """Connect a single registered TV."""
        result = await self._request("POST", f"/api/registry/{device_id}/connect")
        if not isinstance(result, dict):
            raise TvHubError("Unexpected connect response")
        return result

    async def guest_check_in(
        self,
        property_id: int,
        guest_name: str,
        *,
        check_in: str | None = None,
        check_out: str | None = None,
        checkout_time: str | None = None,
        apply_to_welcome: bool = True,
    ) -> dict[str, Any]:
        """Record guest check-in and optionally update welcome screen."""
        body: dict[str, Any] = {
            "guest_name": guest_name,
            "apply_to_welcome": apply_to_welcome,
        }
        if check_in:
            body["check_in"] = check_in
        if check_out:
            body["check_out"] = check_out
        if checkout_time:
            body["checkout_time"] = checkout_time
        result = await self._request(
            "POST",
            "/api/guest-stays/check-in",
            params={"property_id": property_id},
            json=body,
        )
        if not isinstance(result, dict):
            raise TvHubError("Unexpected check-in response")
        return result

    async def guest_check_out(
        self,
        property_id: int,
        *,
        clear_streaming: bool = True,
    ) -> dict[str, Any]:
        """Check out guest, reset welcome, optionally clear streaming logins."""
        result = await self._request(
            "POST",
            "/api/guest-stays/check-out",
            params={"property_id": property_id, "clear_streaming": clear_streaming},
        )
        if not isinstance(result, dict):
            raise TvHubError("Unexpected check-out response")
        return result

    async def clear_streaming_logins_all(self) -> dict[str, Any]:
        """Clear streaming app sign-ins on all connected TVs."""
        result = await self._request("POST", "/api/registry/clear-streaming-logins-all")
        if not isinstance(result, dict):
            raise TvHubError("Unexpected clear-streaming response")
        return result

    async def clear_streaming_logins_device(self, device_id: int) -> dict[str, Any]:
        """Clear streaming app sign-ins on one TV."""
        result = await self._request(
            "POST",
            f"/api/aatomhome/registry/{device_id}/clear-streaming-logins",
        )
        if not isinstance(result, dict):
            raise TvHubError("Unexpected clear-streaming response")
        return result

    async def get_room_config(self, device_id: int) -> dict[str, Any]:
        """Return per-TV room config (Phase 2)."""
        result = await self._request("GET", f"/api/registry/{device_id}/room-config")
        if not isinstance(result, dict):
            raise TvHubError("Unexpected room-config response")
        return result

    async def set_room_config(
        self,
        device_id: int,
        *,
        room_name: str | None = None,
        welcome_overrides: dict[str, Any] | None = None,
        controls: list[dict[str, Any]] | None = None,
        dashboard_mode: str | None = None,
        ha_dashboard_url: str | None = None,
    ) -> dict[str, Any]:
        """Write per-TV room config to the hub (merges with existing — never wipes controls on name-only sync)."""
        existing_payload = await self.get_room_config(device_id)
        current = existing_payload.get("room_config") or {}
        body: dict[str, Any] = {
            "room_name": room_name if room_name is not None else current.get("room_name") or "",
            "welcome_overrides": (
                welcome_overrides
                if welcome_overrides is not None
                else current.get("welcome_overrides") or {}
            ),
            "controls": controls if controls is not None else current.get("controls") or [],
            "dashboard_mode": (
                dashboard_mode
                if dashboard_mode is not None
                else current.get("dashboard_mode") or "cdo_str"
            ),
            "ha_dashboard_url": (
                ha_dashboard_url
                if ha_dashboard_url is not None
                else current.get("ha_dashboard_url") or ""
            ),
        }
        result = await self._request(
            "PUT",
            f"/api/registry/{device_id}/room-config",
            json=body,
        )
        if not isinstance(result, dict):
            raise TvHubError("Unexpected room-config write response")
        return result
