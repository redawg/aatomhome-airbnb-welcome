# Deploy profiles

Three parallel profiles — **one codebase**, same image tag and HA integration version. Only URLs and host placement differ.

| Profile | Directory | Hub host | Default port | HA | TVs |
|---------|-----------|----------|--------------|-----|-----|
| **forest-lan** | [`forest-lan/`](forest-lan/) | `172.16.255.250` | `8080` | Forest HA / Green | Same LAN |
| **infra3-standalone** | [`infra3-standalone/`](infra3-standalone/) | `172.16.1.36` Podman | **`18080`** | Forest HA REST (remote) | VPN or none |
| **cdo-vpn** | [`cdo-vpn/`](cdo-vpn/) | `172.16.1.36` | **`18080`** | Optional | VPN → `172.18.1.x` |

**Why infra3 uses 18080:** host `:8080` on `172.16.1.36` is EcoFlow Ocean; OrderPort MCP uses `:10001` (gateway `:8080` proxies to it). tv-hub must not bind `:8080` on infra3.

## Configure profile + port

Use the interactive helper before first deploy (creates or updates `.env`):

```bash
# Defaults per profile (forest-lan :8080, infra3/cdo-vpn :18080)
./scripts/configure-deploy.sh --profile infra3-standalone

# Override listen port or host
./scripts/configure-deploy.sh --profile forest-lan --host 172.16.255.250 --port 8080 --force
./scripts/configure-deploy.sh --profile custom --host 10.0.0.5 --port 9090 --force

# Then deploy
./scripts/deploy-profile.sh infra3-standalone
```

Keys written to each profile `.env`:

| Key | Purpose |
|-----|---------|
| `HUB_HOST` | IP or hostname TVs/HA use |
| `HUB_LISTEN_PORT` | uvicorn bind port (container uses `HUB_LISTEN_PORT` entrypoint) |
| `HUB_PUBLIC_URL` | `http://$HUB_HOST:$HUB_LISTEN_PORT` |
| `HUB_GUEST_URL` | `$HUB_PUBLIC_URL/guest/` |

## Quick start (manual)

```bash
cp deploy/profiles/forest-lan/env.example deploy/profiles/forest-lan/.env
# Edit secrets (HA_LONG_LIVED_TOKEN, etc.)

./scripts/deploy-profile.sh forest-lan
ENV_FILE=deploy/profiles/forest-lan/.env ./scripts/verify-hub.sh
```

Legacy paths:

- `deploy-forest-home.sh` → `forest-lan`
- `deploy-local-hub.sh` → `infra3-standalone`
- `deploy.sh` with `deploy/.env` for custom

## Feature sync rule

Every profile must pass:

```bash
ENV_FILE=deploy/profiles/<profile>/.env ./scripts/verify-hub.sh
```

Checklist (all profiles):

- [ ] `GET /api/health` → `status: ok`
- [ ] `GET /api/registry` → JSON array
- [ ] `GET /guest/` → HTTP 200
- [ ] `GET /api/aatomhome/health` → extensions loaded
- [ ] HA integration copied; add integration in UI
- [ ] Same `ADB_TV_HUB_TAG` / image label across profiles

## HA Green

Green runs **integration only** — not tv-hub. See [docs/GREEN-HA.md](../../docs/GREEN-HA.md).

## Networking

See [docs/NETWORKING.md](../../docs/NETWORKING.md) before placing hub off-property.
