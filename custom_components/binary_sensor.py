"""Binary sensors for registered guest TVs."""

from __future__ import annotations

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import TvHubCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: TvHubCoordinator = hass.data[DOMAIN][entry.entry_id]
    known_ids: set[int] = set()

    def _create_entity(device: dict) -> TvOnlineBinarySensor:
        known_ids.add(device["id"])
        return TvOnlineBinarySensor(coordinator, entry, device)

    entities = [_create_entity(device) for device in coordinator.data.registry]
    async_add_entities(entities)

    @callback
    def _handle_coordinator_update() -> None:
        if not coordinator.last_update_success or coordinator.data is None:
            return
        new_devices = [
            device
            for device in coordinator.data.registry
            if device["id"] not in known_ids
        ]
        if not new_devices:
            return
        async_add_entities([_create_entity(device) for device in new_devices])

    coordinator.async_add_listener(_handle_coordinator_update)


class TvOnlineBinarySensor(CoordinatorEntity[TvHubCoordinator], BinarySensorEntity):
    """Whether a registered TV is connected via ADB."""

    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: TvHubCoordinator,
        entry: ConfigEntry,
        device: dict,
    ) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._device = device
        device_id = device["id"]
        self._attr_unique_id = f"{entry.entry_id}_tv_{device_id}_online"
        self._attr_name = "Online"
        self._update_device_info()

    def _update_device_info(self) -> None:
        device_id = self._device["id"]
        room_name = self.coordinator.room_name_for_device(device_id)
        device_name = room_name or self._device.get("name") or f"TV {device_id}"
        profile = self._device.get("device_profile") or {}
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"tv_{device_id}")},
            name=device_name,
            manufacturer="Aatomhome",
            model=profile.get("model") or "Guest TV",
            via_device=(DOMAIN, self._entry.entry_id),
        )

    @callback
    def _handle_coordinator_update(self) -> None:
        self._update_device_info()
        super()._handle_coordinator_update()

    @property
    def available(self) -> bool:
        return self.coordinator.last_update_success

    @property
    def is_on(self) -> bool:
        current = self._current_device()
        if not current:
            return False
        return current.get("connection_state") == "device"

    @property
    def extra_state_attributes(self) -> dict:
        current = self._current_device()
        if not current:
            return {}
        attrs = {
            "device_id": current.get("id"),
            "host": current.get("host"),
            "port": current.get("port"),
            "serial": current.get("serial"),
            "connection_state": current.get("connection_state"),
        }
        room_name = self.coordinator.room_name_for_device(current["id"])
        if room_name:
            attrs["room_name"] = room_name
        profile = current.get("device_profile") or {}
        if profile.get("manufacturer"):
            attrs["tv_manufacturer"] = profile["manufacturer"]
        if profile.get("model"):
            attrs["tv_model"] = profile["model"]
        return attrs

    def _current_device(self) -> dict | None:
        device_id = self._device["id"]
        if self.coordinator.data is None:
            return self._device
        for device in self.coordinator.data.registry:
            if device.get("id") == device_id:
                return device
        return None

    @property
    def device_id(self) -> int:
        return self._device["id"]
