# Deploy profiles

Three parallel profiles — **one codebase**, same image tag and HA integration version. Only URLs and host placement differ.

| Profile | Directory | Hub host | HA | TVs |
|---------|-----------|----------|-----|-----|
| **forest-lan** | [`forest-lan/`](forest-lan/) | Linux on Forest Home LAN | Forest HA / Green `172.16.255.250` | Same LAN |
| **infra3-standalone** | [`infra3-standalone/`](infra3-standalone/) | `172.16.1.36` Podman | Forest HA REST (remote) | VPN or none |
| **cdo-vpn** | [`cdo-vpn/`](cdo-vpn/) | `172.16.1.36` or `.30` | Optional | VPN → `172.18.1.x` |

## Quick start

```bash
# Pick a profile
cp deploy/profiles/forest-lan/env.example deploy/profiles/forest-lan/.env
# Edit secrets (HA_LONG_LIVED_TOKEN, etc.)

./scripts/deploy-profile.sh forest-lan
./scripts/verify-hub.sh   # uses ENV_FILE from profile if set
```

Or legacy paths:

- `deploy-forest-home.sh` → alias for `forest-lan`
- `deploy.sh` with `DEPLOY_PROFILE=infra3-standalone` and `deploy/.env`

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
