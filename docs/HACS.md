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

The GitHub repository must be **public** for HACS to download it. If you fork this project, make your fork public (or use a release archive).

1. HACS → **Integrations** → ⋮ → **Custom repositories**
2. Repository URL: `https://github.com/redawg/aatomhome-airbnb-welcome`
3. Category: **Integration**
4. **Add** → search **Aatomhome Airbnb Welcome** → **Download**
5. Restart Home Assistant
6. **Settings → Devices & services → Add integration** → **Aatomhome Airbnb Welcome** → enter your hub URL (e.g. `http://192.168.1.100:8080`)

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

- `hacs.json` at repo root (valid JSON)
- `custom_components/<domain>/manifest.json` — **must be valid JSON** (not YAML); include `config_flow: true`
- `translations/en.json` (or `strings.json` for older HA)

If HACS shows `unexpected character, expected a JSON value`, check `manifest.json` first — a YAML-style manifest triggers that error.

See [HA-PLUGIN-FRAMEWORK.md](HA-PLUGIN-FRAMEWORK.md) for extending the integration.
