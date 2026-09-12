# Architecture

## Problem

CDO today uses a **property-wide** welcome screen. For multi-room Airbnb-style properties, each TV should show:

- **Room name** (Casita, Bedroom 2, …)
- **Selected HA controls** for that room (lights, ceiling fan, blinds)

Staff should configure rooms from **Home Assistant**, not by SSH or JSON on each TV.

## Components

### 1. Home Assistant integration (`aatomhome_airbnb_welcome`)

- Polls tv-hub registry for TV online state
- Services: guest check-in/out, connect-all TVs, clear streaming logins
- **Options flow:** for each registered TV, pick room name + HA entities (light, cover, fan, switch)

### 2. tv-hub (fork of adb-tv-hub)

New concepts on top of existing guest welcome + ADB stack:

| Addition | Purpose |
|----------|---------|
| `devices.room_config` JSON | Room name, welcome overrides, control entity list |
| `GET/PUT /api/registry/{id}/room-config` | HA integration writes config |
| `backend/ha_bridge.py` | HA REST client (`HA_URL`, `HA_TOKEN`) |
| `POST /api/guest-welcome/room-control` | TV actions; whitelist per room |
| Extended `GET /api/guest-welcome/public` | Room name + control states for matched TV IP |

### 3. Guest welcome app

- Hero: “Your stay in **{room_name}**”
- Section: **Room controls** (tiles for light / fan / blinds)
- Existing: WiFi, weather, streaming, clear logins, Google TV

## Security

- TV → hub only (no HA token on device)
- Hub validates entity_id against that TV’s `room_config.controls`
- Optional `HUB_API_TOKEN` before exposing beyond LAN

## Deploy target

**forest-ha** on aatomhome (`172.16.1.30`) — can reach CDO TVs over VPN for pilot testing without touching `172.18.1.137` production until ready.

## Related

- Frozen CDO prod: [adb-tv-hub/deploy/cdo](https://github.com/redawg/adb-tv-hub/tree/main/deploy/cdo)
