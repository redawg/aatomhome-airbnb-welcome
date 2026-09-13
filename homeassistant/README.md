# Home Assistant integration

Copy into your HA config:

```bash
cp -r custom_components/aatomhome_airbnb_welcome "$HA_CONFIG_DIR/custom_components/"
```

Restart Home Assistant, then **Settings → Devices & services → Add integration → Aatomhome Airbnb Welcome**.

## Requirements

- Running [adb-tv-hub](https://github.com/redawg/adb-tv-hub) instance reachable from Home Assistant
- Hub responds to `GET /api/health`

## Entities

| Entity | Description |
|--------|-------------|
| `sensor.*_connected_tvs` | ADB-connected TV count from hub health |
| `sensor.*_active_guest` | Current guest name (if checked in) |
| `binary_sensor.*_online` | One per registered TV — online when ADB state is `device` |

## Services

| Service | Purpose |
|---------|---------|
| `aatomhome_airbnb_welcome.connect_all_tvs` | mDNS + ADB connect for every registered TV |
| `aatomhome_airbnb_welcome.connect_tv` | Connect one TV (by `device_id` or entity target) |
| `aatomhome_airbnb_welcome.guest_check_in` | Set guest name and welcome screen |
| `aatomhome_airbnb_welcome.guest_check_out` | Reset welcome; optional streaming sign-out |
| `aatomhome_airbnb_welcome.clear_streaming_logins` | Sign out streaming apps (one TV or all) |

## Example automation

```yaml
alias: Guest arrival — connect TVs and welcome
trigger:
  - platform: state
    entity_id: input_boolean.guest_checked_in
    to: "on"
action:
  - service: aatomhome_airbnb_welcome.guest_check_in
    data:
      guest_name: "{{ states('input_text.guest_name') }}"
  - service: aatomhome_airbnb_welcome.connect_all_tvs
```

## Options

**Settings → Devices & services → Guest Welcome Hub → Configure** — poll interval and per-TV room names. Saving options **writes room names to the hub** via `PUT /api/registry/{id}/room-config` (Phase 2).

`clear_streaming_logins` prefers the TV outbound agent (`/api/aatomhome/registry/{id}/clear-streaming-logins`) when the launcher agent is connected, then falls back to hub ADB.
