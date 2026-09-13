# Home Assistant integration

**Canonical source:** [`../custom_components/aatomhome_airbnb_welcome/`](../custom_components/aatomhome_airbnb_welcome/) (HACS layout at repo root).

Install via **HACS** — [docs/HACS.md](../docs/HACS.md).

Manual install:

```bash
./scripts/configure-deploy.sh --type homeassistant --host YOUR_HUB_IP --port 8080 --force
./scripts/deploy-profile.sh homeassistant
```

Extension API: [docs/HA-PLUGIN-FRAMEWORK.md](../docs/HA-PLUGIN-FRAMEWORK.md).

The legacy path `homeassistant/custom_components/` is no longer used; edit files under `custom_components/` only.
