# Deploy Aatomhome Airbnb Welcome

End-to-end deployment for humans and AI agents.

## Two deploy types

| Type | Installs | Command |
|------|----------|---------|
| **container** | tv-hub (Podman) | `./scripts/deploy-profile.sh container` |
| **homeassistant** | HA integration | **HACS** ([HACS.md](HACS.md)) or `./scripts/deploy-profile.sh homeassistant` |

Configure first:

```bash
./scripts/configure-deploy.sh --type container --host 192.168.1.10 --port 8080 --force
# remote host:
./scripts/configure-deploy.sh --type container --mode remote --deploy-host 10.0.0.5 --port 18080 --force
```

Verify:

```bash
ENV_FILE=deploy/profiles/container/.env ./scripts/verify-hub.sh
```

See [`deploy/profiles/README.md`](../deploy/profiles/README.md), [HA-PLUGIN-FRAMEWORK.md](HA-PLUGIN-FRAMEWORK.md), [NETWORKING.md](NETWORKING.md).

### Custom / legacy `deploy.sh`

1. Read [QUESTIONNAIRE.md](QUESTIONNAIRE.md).
2. `./scripts/configure-deploy.sh --type custom --force` or copy `deploy/env.template` → `deploy/.env`.
3. `./scripts/build.sh` then `./scripts/deploy.sh`.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Home Assistant  │────▶│ tv-hub (Podman)    │────▶│ Guest TVs   │
│ HACS integration│     │ ADB + welcome UI   │     │ WebView APK │
└─────────────────┘     └──────────────────┘     └─────────────┘
```

**tv-hub** is fetched from upstream [`adb-tv-hub`](https://github.com/redawg/adb-tv-hub) at tag `cdo-production-2026-09-11` into `./tv-hub/` on first deploy.
