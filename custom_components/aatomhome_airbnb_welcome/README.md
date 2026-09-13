# Aatomhome Airbnb Welcome — Home Assistant integration

Connects Home Assistant to a **tv-hub** (adb-tv-hub) instance for guest check-in/out, TV registry, room config, and streaming control.

## Install

**Recommended — HACS:** add this repository as a [custom repository](https://hacs.xyz/docs/faq/custom_repositories/), category **Integration**. See [docs/HACS.md](../../../docs/HACS.md) in the repo root.

**Manual:** copy this folder to `config/custom_components/aatomhome_airbnb_welcome/` or run:

```bash
./scripts/deploy-profile.sh homeassistant
```

## Configuration

1. Deploy **tv-hub** first (`./scripts/configure-deploy.sh --type container`).
2. In HA: **Settings → Devices & services → Add integration → Aatomhome Airbnb Welcome**.
3. Enter your hub URL (e.g. `http://192.168.1.10:8080`).

## Extending (plugin framework)

See [docs/HA-PLUGIN-FRAMEWORK.md](../../../docs/HA-PLUGIN-FRAMEWORK.md) and `plugins/` in this package.
