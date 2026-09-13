"""Config and options flows for Aatomhome Airbnb Welcome."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    CONF_HUB_API_TOKEN,
    CONF_HUB_URL,
    CONF_POLL_INTERVAL,
    CONF_PROPERTY_ID,
    CONF_PROPERTY_NAME,
    CONF_TV_ROOMS,
    DEFAULT_HUB_URL,
    DEFAULT_POLL_INTERVAL,
    DEFAULT_PROPERTY_ID,
    DOMAIN,
)
from .hub_client import TvHubClient, TvHubError

_LOGGER = logging.getLogger(__name__)

STEP_USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_HUB_URL, default=DEFAULT_HUB_URL): str,
        vol.Required(CONF_PROPERTY_NAME, default="Airbnb Property"): str,
        vol.Optional(CONF_PROPERTY_ID, default=DEFAULT_PROPERTY_ID): vol.All(
            int, vol.Range(min=1)
        ),
        vol.Optional(CONF_POLL_INTERVAL, default=DEFAULT_POLL_INTERVAL): vol.All(
            int, vol.Range(min=10, max=300)
        ),
        vol.Optional(CONF_HUB_API_TOKEN): str,
    }
)


def _normalize_hub_url(url: str) -> str:
    cleaned = url.strip().rstrip("/")
    parsed = urlparse(cleaned)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("invalid_url")
    return cleaned


async def _validate_hub(hass: HomeAssistant, hub_url: str, api_token: str | None) -> dict[str, Any]:
    session = async_get_clientsession(hass)
    client = TvHubClient(session, hub_url, api_token or None)
    return await client.get_health()


class AatomhomeAirbnbWelcomeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Aatomhome Airbnb Welcome."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                hub_url = _normalize_hub_url(user_input[CONF_HUB_URL])
            except ValueError:
                errors[CONF_HUB_URL] = "invalid_url"
            else:
                api_token = (user_input.get(CONF_HUB_API_TOKEN) or "").strip() or None
                try:
                    health = await _validate_hub(self.hass, hub_url, api_token)
                except TvHubError as err:
                    _LOGGER.debug("Hub validation failed: %s", err)
                    errors["base"] = "cannot_connect"
                else:
                    await self.async_set_unique_id(hub_url)
                    self._abort_if_unique_id_configured()

                    return self.async_create_entry(
                        title=user_input[CONF_PROPERTY_NAME],
                        data={
                            CONF_HUB_URL: hub_url,
                            CONF_PROPERTY_NAME: user_input[CONF_PROPERTY_NAME],
                            CONF_PROPERTY_ID: user_input[CONF_PROPERTY_ID],
                            CONF_POLL_INTERVAL: user_input[CONF_POLL_INTERVAL],
                            CONF_HUB_API_TOKEN: api_token,
                        },
                        options={CONF_TV_ROOMS: {}},
                    )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_SCHEMA,
            errors=errors,
            description_placeholders={
                "health_hint": "Hub must respond to GET /api/health",
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> AatomhomeAirbnbWelcomeOptionsFlow:
        return AatomhomeAirbnbWelcomeOptionsFlow(config_entry)


class AatomhomeAirbnbWelcomeOptionsFlow(config_entries.OptionsFlow):
    """Options flow — poll interval and per-TV room names (Phase 5 stub)."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        if user_input is not None:
            tv_rooms: dict[str, dict[str, str]] = {}
            poll_interval = user_input[CONF_POLL_INTERVAL]
            for key, value in user_input.items():
                if not key.startswith("room_"):
                    continue
                room_name = str(value).strip() if value else ""
                if not room_name:
                    continue
                device_id = key.removeprefix("room_")
                tv_rooms[device_id] = {"room_name": room_name}
            entry = self.async_create_entry(
                title="",
                data={
                    CONF_POLL_INTERVAL: poll_interval,
                    CONF_TV_ROOMS: tv_rooms,
                },
            )
            coordinator_data = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)
            if coordinator_data is not None:
                coordinator_data.data.tv_rooms = tv_rooms
                try:
                    await coordinator_data.sync_room_names_to_hub()
                except TvHubError as err:
                    _LOGGER.warning("Room config sync to hub failed: %s", err)
            return entry

        coordinator_data = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)
        registry: list[dict[str, Any]] = []
        if coordinator_data is not None and coordinator_data.data is not None:
            registry = coordinator_data.data.registry

        tv_rooms = dict(self.config_entry.options.get(CONF_TV_ROOMS, {}))
        schema: dict[vol.Marker, Any] = {
            vol.Optional(
                CONF_POLL_INTERVAL,
                default=self.config_entry.options.get(
                    CONF_POLL_INTERVAL,
                    self.config_entry.data.get(CONF_POLL_INTERVAL, DEFAULT_POLL_INTERVAL),
                ),
            ): vol.All(int, vol.Range(min=10, max=300)),
        }

        for device in registry:
            device_id = str(device["id"])
            default_room = ""
            existing = tv_rooms.get(device_id)
            if isinstance(existing, dict) and existing.get("room_name"):
                default_room = existing["room_name"]
            schema[
                vol.Optional(f"room_{device_id}", default=default_room)
            ] = cv.string

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(schema),
            description_placeholders={
                "room_hint": "Room names sync to the hub welcome screen (PUT /api/registry/{id}/room-config).",
            },
        )
