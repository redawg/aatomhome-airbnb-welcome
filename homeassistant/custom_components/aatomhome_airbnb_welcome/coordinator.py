"""Data update coordinator for tv-hub polling."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_HUB_API_TOKEN,
    CONF_HUB_URL,
    CONF_POLL_INTERVAL,
    CONF_PROPERTY_ID,
    CONF_TV_ROOMS,
    DOMAIN,
)
from .hub_client import TvHubClient, TvHubError

_LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class TvHubData:
    """Coordinator snapshot."""

    health: dict[str, Any]
    registry: list[dict[str, Any]]
    active_stay: dict[str, Any]
    tv_rooms: dict[str, dict[str, Any]]
    room_configs: dict[str, dict[str, Any]]


class TvHubCoordinator(DataUpdateCoordinator[TvHubData]):
    """Poll tv-hub for registry, health, and active guest stay."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.config_entry = entry
        poll_seconds = entry.options.get(CONF_POLL_INTERVAL, entry.data.get(CONF_POLL_INTERVAL, 30))
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=poll_seconds),
        )
        session = async_get_clientsession(hass)
        self.client = TvHubClient(
            session,
            entry.data[CONF_HUB_URL],
            entry.data.get(CONF_HUB_API_TOKEN) or entry.options.get(CONF_HUB_API_TOKEN),
        )
        self.property_id = entry.data.get(CONF_PROPERTY_ID, 1)

    async def _async_update_data(self) -> TvHubData:
        try:
            health = await self.client.get_health()
            registry = await self.client.get_registry()
            active_stay = await self.client.get_active_stay(self.property_id)
        except TvHubError as err:
            raise UpdateFailed(str(err)) from err

        filtered_registry = [
            device
            for device in registry
            if device.get("property_id") in (None, self.property_id)
        ]

        tv_rooms = self.config_entry.options.get(CONF_TV_ROOMS, {})
        if not isinstance(tv_rooms, dict):
            tv_rooms = {}

        room_configs: dict[str, dict[str, Any]] = {}
        for device in filtered_registry:
            device_id = device.get("id")
            if device_id is None:
                continue
            try:
                payload = await self.client.get_room_config(int(device_id))
                room_configs[str(device_id)] = payload.get("room_config") or {}
            except TvHubError:
                room_configs[str(device_id)] = {}

        return TvHubData(
            health=health,
            registry=filtered_registry,
            active_stay=active_stay,
            tv_rooms=tv_rooms,
            room_configs=room_configs,
        )

    def room_name_for_device(self, device_id: int) -> str | None:
        """Return configured room name — hub room_config first, then HA options."""
        if self.data:
            hub_room = self.data.room_configs.get(str(device_id))
            if isinstance(hub_room, dict) and hub_room.get("room_name"):
                return str(hub_room["room_name"])
            room = self.data.tv_rooms.get(str(device_id))
            if isinstance(room, dict) and room.get("room_name"):
                return str(room["room_name"])
        return None

    async def sync_room_names_to_hub(self) -> None:
        """Push HA option room names to hub room_config (Phase 2)."""
        if not self.data:
            return
        tv_rooms = self.data.tv_rooms
        for device_id, room in tv_rooms.items():
            if not isinstance(room, dict):
                continue
            room_name = str(room.get("room_name") or "").strip()
            if not room_name:
                continue
            await self.client.set_room_config(int(device_id), room_name=room_name)
