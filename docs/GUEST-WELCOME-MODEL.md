# Guest Welcome — property vs per-TV

## Standard guest screen (same on every TV)

Configured once per **property** in hub Setup → Welcome / Property:

| Content | Source |
|---------|--------|
| Layout & branding | Shared `/guest/` template |
| Weather | Property `weather_lat` / `weather_lon` (+ optional Tempest station) |
| Local tips & hiking trails | Auto from property coordinates (region catalog) + optional host `local_tips` |
| Activity recommendations | Always **hiking** + region secondary (hot springs in desert, waterfall/lake trails in Pacific NW) from forecast |
| Wi‑Fi, guidebook QR | Property welcome config |
| Streaming apps row | Property + TV capability filter |
| Guest name, stay dates | Active stay / property |
| Hero eyebrow, title, subtitle | Property welcome config (Setup → Guest Experience → Branding) |

Guests see the **same** welcome experience in every room. TVs only differ in the room-specific strip below.

## Per-TV / per-room only

Configured in Setup → Rooms for each registered TV:

| Field | Purpose |
|-------|---------|
| **Room name** | Default eyebrow when hub eyebrow is blank (“Your stay in Family Room”) and controls section title |
| **Controls** | Home Assistant entities this TV may toggle (whitelist) |

Optional (usually set once per property, not per room):

| Field | Notes |
|-------|-------|
| `dashboard_mode` | `cdo_str` (full welcome) or `ha_dashboard` (HA panel focus) — prefer one mode for the whole property |
| `ha_dashboard_url` | Lovelace path when using HA embed |

Do **not** use per-room `welcome_overrides` for weather, tips, or copy — those stay property-wide.

## API shape

- `GET /api/guest-welcome/public` — property content (anonymous or fingerprint hint)
- `GET /api/guest-welcome/room` — authenticated TV: merges **room name + controls + HA embed** onto the public config

## Adding a new TV

1. Create room slot → get room code  
2. Set **room name** and **devices this TV controls**  
3. Claim on TV — guest screen matches all other TVs except room label and control tiles
