"""Config flow for tv-hub URL and property settings."""

from homeassistant import config_entries

from .const import DOMAIN


class AatomhomeAirbnbWelcomeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        return self.async_abort(reason="not_implemented")
