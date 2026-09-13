# Deploy types

Two generic deploy types — **no site-specific profile names**.

| Type | Installs | Use when |
|------|----------|----------|
| **container** | tv-hub Podman quadlet | You need the hub API + ADB on a Linux host |
| **homeassistant** | HA custom integration | tv-hub already running; prefer **HACS** ([docs/HACS.md](../../docs/HACS.md)) |

## Configure

```bash
# Container on this host (default port 8080)
./scripts/configure-deploy.sh --type container --host 192.168.1.10 --port 8080 --force

# Container on remote host via SSH
./scripts/configure-deploy.sh --type container --mode remote --deploy-host 10.0.0.5 --port 18080 --force

# HA integration only (or use HACS instead)
./scripts/configure-deploy.sh --type homeassistant --host 192.168.1.10 --port 8080 --force
```

## Deploy

```bash
./scripts/deploy-profile.sh container
./scripts/deploy-profile.sh homeassistant   # manual copy; HACS recommended
```

## Environment keys

| Key | container | homeassistant |
|-----|-----------|---------------|
| `HUB_HOST` | Listen / public host | Hub URL host for config flow |
| `HUB_LISTEN_PORT` | uvicorn bind port | — |
| `HUB_PUBLIC_URL` | Derived | Shown in docs / options |
| `CONTAINER_DEPLOY_MODE` | `local` or `remote` | — |
| `DEPLOY_HOST` | SSH target when `remote` | — |
| `HA_HOST` / `HA_CONFIG_DIR` | Optional post-install | Required for manual install |

## Verify

```bash
ENV_FILE=deploy/profiles/container/.env ./scripts/verify-hub.sh
```

## Legacy profile names

`forest-lan`, `lab host-standalone`, and `cdo-vpn` are **removed**. Use `container` with `--host`, `--port`, and `--mode` instead. Old directories remain as deprecated stubs only.
