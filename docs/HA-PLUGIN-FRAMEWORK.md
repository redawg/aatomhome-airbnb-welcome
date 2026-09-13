# Home Assistant plugin framework

This repo separates **two deploy types**:

| Type | What it installs | How |
|------|------------------|-----|
| **container** | tv-hub (FastAPI + ADB) | Podman quadlet — `./scripts/deploy-profile.sh container` |
| **homeassistant** | HA custom integration | **HACS** (recommended) or `./scripts/deploy-profile.sh homeassistant` |

The integration is the “plugin” surface for Home Assistant: entities, services, and automations that talk to tv-hub.

## Repository layout (HACS)

```
custom_components/aatomhome_airbnb_welcome/
  manifest.json          # domain, version, requirements
  config_flow.py         # UI setup
  coordinator.py         # polling + plugin hooks
  hub_client.py          # REST client to tv-hub
  sensor.py / binary_sensor.py
  services.yaml
  translations/en.json
  plugins/               # extension hook API
```

Canonical path is **repo root** `custom_components/` (required by HACS). The `homeassistant/` directory is documentation only.

## Config flow

Users enter:

- **Hub URL** — `http://<host>:<port>` (must match container `HUB_PUBLIC_URL`)
- **Property name / ID** — matches tv-hub property
- **Poll interval** — registry refresh rate

Options flow: per-TV room names synced to hub `room_config`.

## Extension hooks

Register async callbacks after each successful hub poll:

```python
# custom_components/my_property_plugins/__init__.py
from homeassistant.core import HomeAssistant
from custom_components.aatomhome_airbnb_welcome.plugins import register_on_sync

async def on_hub_sync(coordinator, data):
    # data["registry"], data["active_stay"], data["room_configs"], …
    ...

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    register_on_sync(on_hub_sync)
    return True
```

Hooks must not raise — failures are logged and ignored so core polling continues.

## Services (built-in)

Defined in `services.yaml`:

- `aatomhome_airbnb_welcome.connect_all`
- `aatomhome_airbnb_welcome.guest_check_in` / `guest_check_out`
- `aatomhome_airbnb_welcome.clear_streaming`

Add custom services by forking or wrapping these in your plugin package.

## Adding platforms

To add a new platform (e.g. `button` for per-TV actions):

1. Create `button.py` with `async_setup_entry`
2. Add `"button"` to `manifest.json` → `dependencies` if needed
3. Register entities using `TvHubCoordinator` from `coordinator.py`
4. Bump `manifest.json` version and tag a release for HACS

## Versioning

- Integration version: `custom_components/aatomhome_airbnb_welcome/manifest.json`
- tv-hub image: `ADB_TV_HUB_TAG` in container profile `.env`

Keep hub URL and integration version independent; validate with `verify-hub.sh` after container upgrades.

## Related

- [HACS.md](HACS.md) — install steps
- [DEPLOY.md](DEPLOY.md) — container + integration deploy
- [TEST-FRAMEWORK.md](TEST-FRAMEWORK.md) — multi-hub TV testing (generic hub slots)
