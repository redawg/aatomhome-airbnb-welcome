# HACS installation

The Home Assistant integration ships in this repository using the **standard HACS layout**:

```
aatomhome-airbnb-welcome/
  hacs.json
  custom_components/
    aatomhome_airbnb_welcome/
```

## Prerequisites

1. **tv-hub** running and reachable from Home Assistant (container deploy — see below).
2. [HACS](https://hacs.xyz/) installed on your HA instance.

## Add custom repository

1. HACS → **Integrations** → ⋮ → **Custom repositories**
2. Repository URL: `https://github.com/redawg/aatomhome-airbnb-welcome`
3. Category: **Integration**
4. Install **Aatomhome Airbnb Welcome**
5. Restart Home Assistant
6. **Settings → Devices & services → Add integration** → enter your hub URL

## Default branch updates

HACS tracks releases/tags when `zip_release` is enabled. This repo uses **default branch** installs until tagged releases are published.

## tv-hub (container) vs integration

| Component | Deploy type | Command |
|-----------|-------------|---------|
| **tv-hub** (ADB + guest API) | `container` | `./scripts/configure-deploy.sh --type container --host YOUR_IP --port 8080` then `./scripts/deploy-profile.sh container` |
| **HA integration** | HACS or `homeassistant` | HACS UI **or** `./scripts/deploy-profile.sh homeassistant` |

You need **both** for full functionality: container first, then HACS integration.

## Validation

Community HACS checks expect:

- `hacs.json` at repo root
- `custom_components/<domain>/manifest.json` with `config_flow`
- `translations/en.json` (or `strings.json` for older HA)

See [HA-PLUGIN-FRAMEWORK.md](HA-PLUGIN-FRAMEWORK.md) for extending the integration.
