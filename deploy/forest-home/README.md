# Forest Home deploy bundle

Deploy **tv-hub** + **Home Assistant integration** for [Forest Home](http://192.168.1.10:8123) (`192.168.1.10`).

```
┌──────────────────────────── 192.168.1.10 ────────────────────────────┐
│  Home Assistant :8123          tv-hub (Podman, host net) :8080         │
│       ▲                              │                                 │
│       │  HA integration              │  ADB wireless                   │
│       └──────── REST /api ───────────┘                                 │
└────────────────────────────────────────│───────────────────────────────┘
                                         ▼
                                  Guest TVs (LAN)
```

## Prerequisites

| Item | Notes |
|------|--------|
| SSH | `root@192.168.1.10` with key from deploy workstation (same as SensorLinx deploys) |
| Podman | On Forest Home host — `podman --version` via SSH |
| TVs | On same LAN (or routable) for wireless debugging |
| HA token | Long-lived token in vault `ha_token` or `deploy/sample-property/.env` |

**HA OS note:** If Podman is not available on the HA appliance, run tv-hub on a **sibling Linux host** on the Forest Home LAN and set `HUB_PUBLIC_URL` / `HA_HOST` accordingly.

## Quick deploy

From repo root on a workstation that can SSH to Forest Home:

```bash
cp deploy/sample-property/env.example deploy/sample-property/.env
# Edit HA_LONG_LIVED_TOKEN (or export from vault)

./scripts/deploy-sample-property.sh
```

This will:

1. Fetch upstream `adb-tv-hub` @ `cdo-production-2026-09-11`
2. Patch guest launcher APK hub URL → `http://192.168.1.10:8080/guest/`
3. Rsync build context to `root@192.168.1.10` and `podman build` there
4. Install rootful quadlets under `/etc/containers/systemd/`
5. Copy HA integration → `/config/custom_components/aatomhome_airbnb_welcome/`
6. Restart HA core (optional) and verify `/api/health`

## After deploy

1. Open **http://192.168.1.10:8080** — hub admin UI
2. In HA: **Settings → Devices & services → Add integration → Aatomhome Airbnb Welcome**
   - Hub URL: `http://192.168.1.10:8080` (or `http://127.0.0.1:8080` from HA on same host)
3. Register each TV (wireless debugging pair code)
4. Sideload / provision guest launcher APK

## Verify

```bash
curl -s http://192.168.1.10:8080/api/health | python3 -m json.tool
curl -s http://192.168.1.10:8080/api/registry | python3 -m json.tool
```

On the host:

```bash
ssh root@192.168.1.10 systemctl status adb-tv-hub.service
ssh root@192.168.1.10 podman ps --filter name=adb-tv-hub
```

## Files

| File | Purpose |
|------|---------|
| `env.example` | Copy to `.env` — URLs, SSH, HA token |
| `adb-tv-hub.container` | Rootful systemd quadlet (host network) |
| `adb-tv-hub-data.volume` | Persistent registry + ADB keys |
| `adb-tv-hub.env.example` | Runtime env template (secrets not in git) |

## Related

- HA integration docs: [`../../homeassistant/README.md`](../../homeassistant/README.md)
- Frozen legacy production (do not modify): `192.168.2.1` — see upstream `adb-tv-hub/deploy/cdo/`
