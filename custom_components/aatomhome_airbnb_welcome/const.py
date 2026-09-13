"""Constants for the Aatomhome Airbnb Welcome integration."""

DOMAIN = "aatomhome_airbnb_welcome"

CONF_HUB_URL = "hub_url"
CONF_PROPERTY_ID = "property_id"
CONF_PROPERTY_NAME = "property_name"
CONF_POLL_INTERVAL = "poll_interval"
CONF_HUB_API_TOKEN = "hub_api_token"
CONF_TV_ROOMS = "tv_rooms"

DEFAULT_HUB_URL = "http://127.0.0.1:8080"
DEFAULT_PROPERTY_ID = 1
DEFAULT_POLL_INTERVAL = 30

ATTR_DEVICE_ID = "device_id"
ATTR_GUEST_NAME = "guest_name"
ATTR_CHECK_IN = "check_in"
ATTR_CHECK_OUT = "check_out"
ATTR_CHECKOUT_TIME = "checkout_time"
ATTR_APPLY_TO_WELCOME = "apply_to_welcome"
ATTR_CLEAR_STREAMING = "clear_streaming"

PLATFORMS = ["binary_sensor", "sensor"]
