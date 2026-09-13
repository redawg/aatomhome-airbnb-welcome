"""Sensors for tv-hub health and active guest stay."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_HUB_URL, CONF_PROPERTY_NAME, DOMAIN
from .coordinator import TvHubCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: TvHubCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            HubConnectedTvsSensor(coordinator, entry),
            ActiveGuestSensor(coordinator, entry),
        ]
    )


class HubBaseSensor(CoordinatorEntity[TvHubCoordinator], SensorEntity):
    """Shared hub device metadata."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: TvHubCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.data.get(CONF_PROPERTY_NAME, "Guest Welcome Hub"),
            manufacturer="Aatomhome",
            model="tv-hub",
            configuration_url=entry.data.get(CONF_HUB_URL),
        )


class HubConnectedTvsSensor(HubBaseSensor):
    """Count of TVs currently connected to the hub via ADB."""

    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: TvHubCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_connected_tvs"
        self._attr_name = "Connected TVs"
        self._attr_icon = "mdi:television"

    @property
    def native_value(self) -> int:
        return int(self.coordinator.data.health.get("connected_devices", 0))

    @property
    def extra_state_attributes(self) -> dict:
        health = self.coordinator.data.health
        registry = self.coordinator.data.registry
        online = sum(1 for d in registry if d.get("connection_state") == "device")
        return {
            "registered_tvs": len(registry),
            "online_tvs": online,
            "adb_version": health.get("adb_version"),
            "mdns_enabled": health.get("mdns_enabled"),
        }


class ActiveGuestSensor(HubBaseSensor):
    """Name of the current guest stay, if any."""

    def __init__(self, coordinator: TvHubCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_active_guest"
        self._attr_name = "Active guest"
        self._attr_icon = "mdi:account-heart"

    @property
    def native_value(self) -> str | None:
        stay = self.coordinator.data.active_stay.get("active_stay")
        if not stay:
            return None
        return stay.get("guest_name")

    @property
    def extra_state_attributes(self) -> dict:
        stay = self.coordinator.data.active_stay.get("active_stay")
        if not stay:
            return {"checked_in": False}
        return {
            "checked_in": True,
            "stay_id": stay.get("id"),
            "check_in": stay.get("check_in"),
            "check_out": stay.get("check_out"),
            "source": stay.get("source"),
        }
