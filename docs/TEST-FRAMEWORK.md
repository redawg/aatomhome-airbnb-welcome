# Multi-hub test framework

Test **two tv-hub backends** from one TV (dual claim) without rebuilding the APK per hub.

| Slot | Profile ID | Example URL | Use case |
|------|------------|-------------|----------|
| Hub A | `hub-a` | `http://192.168.1.10:8080` | Primary / co-located with HA |
| Hub B | `hub-b` | `http://192.168.1.11:18080` | Secondary / remote / different VLAN |

URLs are editable in the guest launcher claim UI. Legacy IDs `forest-lan` and `infra3` map to Hub A / Hub B.

**Home Assistant:** add **two** integration instances (HACS) — one per hub URL.

## Prerequisites

1. Both hubs running the same `ADB_TV_HUB_TAG` with aatomhome extensions (`GET /api/aatomhome/health`).
2. TV can reach both hub URLs (routing/firewall).
3. Guest launcher rebuilt from `guest-launcher/src/` or sideload dev build.

## Deploy hubs (container type)

```bash
./scripts/build.sh

# Hub A
./scripts/configure-deploy.sh --type container --host 192.168.1.10 --port 8080 --force
./scripts/deploy-profile.sh container

# Hub B (remote example)
./scripts/configure-deploy.sh --type container --host 192.168.1.11 --port 18080 --mode remote --deploy-host 192.168.1.11 --force
# Edit deploy/profiles/container/.env between deploys or maintain two .env files
```

## HA setup

1. HACS → install integration (see [HACS.md](HACS.md))
2. Add integration → Hub A URL
3. Add integration again → Hub B URL

## TV claim

1. Open guest launcher → claim screen
2. Select **Hub A** or **Hub B**, enter hub base URL, complete claim code flow
3. Menu/Info → switch active hub

## Verify

| Check | Hub A | Hub B |
|-------|-------|-------|
| Health | `curl http://HOST_A:PORT/api/aatomhome/health` | same for B |
| Welcome | TV loads `…/guest/` | TV loads `…/guest/` |

ADB intent example:

```bash
adb shell am start -n com.cielodeloro.guestwelcome/.MainActivity \
  --es hub_profile hub-a \
  --es hub_url http://192.168.1.10:8080/guest/
```
