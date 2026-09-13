# Architecture

## Problem

Many short-term rentals use a **property-wide** welcome screen on every TV. For multi-room stays, each TV should show:

- **Room name** (Guest suite, Bedroom 2, …)
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

Typical pilot: tv-hub on a Linux host on the property LAN (`192.168.1.100:8080`) with Home Assistant on the same network (`192.168.1.10:8123`).

## Related

- Upstream baseline: [docs/UPSTREAM.md](UPSTREAM.md)
- [adb-tv-hub](https://github.com/redawg/adb-tv-hub)
