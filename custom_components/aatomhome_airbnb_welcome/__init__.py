"""Aatomhome Airbnb Welcome — Home Assistant integration."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv, entity_registry as er

from .const import (
    ATTR_APPLY_TO_WELCOME,
    ATTR_CHECK_IN,
    ATTR_CHECK_OUT,
    ATTR_CHECKOUT_TIME,
    ATTR_CLEAR_STREAMING,
    ATTR_DEVICE_ID,
    ATTR_GUEST_NAME,
    CONF_PROPERTY_ID,
    DOMAIN,
    PLATFORMS,
)
from .coordinator import TvHubCoordinator
from .hub_client import TvHubError

_LOGGER = logging.getLogger(__name__)

SERVICE_CONNECT_ALL_TVS = "connect_all_tvs"
SERVICE_CONNECT_TV = "connect_tv"
SERVICE_GUEST_CHECK_IN = "guest_check_in"
SERVICE_GUEST_CHECK_OUT = "guest_check_out"
SERVICE_CLEAR_STREAMING_LOGINS = "clear_streaming_logins"

CONNECT_TV_SCHEMA = cv.make_entity_service_schema(
    {vol.Optional(ATTR_DEVICE_ID): cv.positive_int}
)
CLEAR_STREAMING_SCHEMA = cv.make_entity_service_schema(
    {vol.Optional(ATTR_DEVICE_ID): cv.positive_int}
)
GUEST_CHECK_IN_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_GUEST_NAME): cv.string,
        vol.Optional(ATTR_CHECK_IN): cv.string,
        vol.Optional(ATTR_CHECK_OUT): cv.string,
        vol.Optional(ATTR_CHECKOUT_TIME): cv.string,
        vol.Optional(ATTR_APPLY_TO_WELCOME, default=True): cv.boolean,
    }
)
GUEST_CHECK_OUT_SCHEMA = vol.Schema(
    {vol.Optional(ATTR_CLEAR_STREAMING, default=True): cv.boolean}
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = TvHubCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _register_services(hass)

    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        _maybe_unregister_services(hass)
    return unload_ok


async def _async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)


def _get_coordinator(hass: HomeAssistant) -> TvHubCoordinator:
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        raise HomeAssistantError("Integration is not configured")
    coordinator: TvHubCoordinator = hass.data[DOMAIN][entries[0].entry_id]
    return coordinator


def _device_id_from_entity(hass: HomeAssistant, entity_ids: list[str]) -> int | None:
    registry = er.async_get(hass)
    for entity_id in entity_ids:
        entry = registry.async_get(entity_id)
        if not entry or not entry.unique_id:
            continue
        marker = "_tv_"
        if marker in entry.unique_id and entry.unique_id.endswith("_online"):
            middle = entry.unique_id.split(marker, 1)[1]
            device_id = middle.removesuffix("_online")
            try:
                return int(device_id)
            except ValueError:
                continue
    return None


def _register_services(hass: HomeAssistant) -> None:
    if hass.services.has_service(DOMAIN, SERVICE_CONNECT_ALL_TVS):
        return

    async def connect_all(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass)
        try:
            result = await coordinator.client.connect_all(coordinator.property_id)
        except TvHubError as err:
            raise HomeAssistantError(str(err)) from err
        await coordinator.async_request_refresh()
        _LOGGER.info("Connect all TVs: %s", result.get("message"))

    async def connect_tv(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass)
        device_id = call.data.get(ATTR_DEVICE_ID)
        if device_id is None and call.data.get(ATTR_ENTITY_ID):
            device_id = _device_id_from_entity(hass, call.data[ATTR_ENTITY_ID])
        if device_id is None:
            raise HomeAssistantError("device_id or a TV online entity is required")
        try:
            result = await coordinator.client.connect_device(device_id)
        except TvHubError as err:
            raise HomeAssistantError(str(err)) from err
        if not result.get("ok"):
            raise HomeAssistantError(result.get("message", "Connect failed"))
        await coordinator.async_request_refresh()

    async def guest_check_in(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass)
        try:
            await coordinator.client.guest_check_in(
                coordinator.property_id,
                call.data[ATTR_GUEST_NAME],
                check_in=call.data.get(ATTR_CHECK_IN),
                check_out=call.data.get(ATTR_CHECK_OUT),
                checkout_time=call.data.get(ATTR_CHECKOUT_TIME),
                apply_to_welcome=call.data.get(ATTR_APPLY_TO_WELCOME, True),
            )
        except TvHubError as err:
            raise HomeAssistantError(str(err)) from err
        await coordinator.async_request_refresh()

    async def guest_check_out(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass)
        try:
            await coordinator.client.guest_check_out(
                coordinator.property_id,
                clear_streaming=call.data.get(ATTR_CLEAR_STREAMING, True),
            )
        except TvHubError as err:
            raise HomeAssistantError(str(err)) from err
        await coordinator.async_request_refresh()

    async def clear_streaming(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass)
        device_id = call.data.get(ATTR_DEVICE_ID)
        if device_id is None and call.data.get(ATTR_ENTITY_ID):
            device_id = _device_id_from_entity(hass, call.data[ATTR_ENTITY_ID])
        try:
            if device_id is not None:
                result = await coordinator.client.clear_streaming_logins_device(device_id)
            else:
                result = await coordinator.client.clear_streaming_logins_all()
        except TvHubError as err:
            raise HomeAssistantError(str(err)) from err
        if not result.get("ok", True):
            raise HomeAssistantError(result.get("message", "Clear streaming failed"))
        await coordinator.async_request_refresh()

    hass.services.async_register(DOMAIN, SERVICE_CONNECT_ALL_TVS, connect_all)
    hass.services.async_register(
        DOMAIN, SERVICE_CONNECT_TV, connect_tv, schema=CONNECT_TV_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_GUEST_CHECK_IN, guest_check_in, schema=GUEST_CHECK_IN_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_GUEST_CHECK_OUT, guest_check_out, schema=GUEST_CHECK_OUT_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_CLEAR_STREAMING_LOGINS,
        clear_streaming,
        schema=CLEAR_STREAMING_SCHEMA,
    )


@callback
def _maybe_unregister_services(hass: HomeAssistant) -> None:
    if hass.config_entries.async_entries(DOMAIN):
        return
    for service in (
        SERVICE_CONNECT_ALL_TVS,
        SERVICE_CONNECT_TV,
        SERVICE_GUEST_CHECK_IN,
        SERVICE_GUEST_CHECK_OUT,
        SERVICE_CLEAR_STREAMING_LOGINS,
    ):
        hass.services.async_remove(DOMAIN, service)
