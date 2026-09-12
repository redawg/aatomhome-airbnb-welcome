# Deployment questionnaire

An AI agent (Cursor, Claude Code, etc.) **must collect answers** before deploying. Do not guess secrets or network topology.

Copy completed answers into `deploy/.env` (from [`env.template`](env.template)).

---

## 1. Deployment target

| Question | Example | Required |
|----------|---------|----------|
| Where will **tv-hub** run? | `aatomhome.theschoenfelds.dom` (172.16.1.30) or on-site property LAN | Yes |
| Where will **Home Assistant** run? | Same host as tv-hub (`forest-ha`) or separate | Yes |
| Can the hub host reach TV IPs over the network? | VPN to 172.18.1.0/24 — yes/no | Yes |
| Podman install style? | `rootless` (user systemd) or `rootful` | Yes |

## 2. Network URLs

| Question | Example | Required |
|----------|---------|----------|
| **HUB_PUBLIC_URL** — URL TVs and browsers use for the hub | `http://172.18.1.137:8080` | Yes |
| **HUB_GUEST_URL** — welcome page (usually hub + `/guest/`) | `http://172.18.1.137:8080/guest/` | Yes |
| **HA_URL** — Home Assistant base URL (for hub → HA bridge, Phase 3+) | `http://127.0.0.1:8123` | For HA controls |
| Property / site name | `Cielo del Oro` | Yes |

## 3. API keys and secrets

| Secret | Purpose | Required | How to obtain |
|--------|---------|----------|---------------|
| **HA_LONG_LIVED_TOKEN** | Hub calls HA services (lights, blinds, fan) | For room controls | HA → Profile → Security → Long-Lived Access Tokens |
| **TEMPEST_API_TOKEN** | Outdoor weather on welcome screen | Optional | [tempestwx.com/settings/tokens](https://tempestwx.com/settings/tokens) |
| **TEMPEST_STATION_ID** | Weather station ID | If Tempest used | Tempest app / API |
| **HUB_API_TOKEN** | Lock hub API (future) | Optional | Generate random string |

Never commit `deploy/.env` to git.

## 4. Home Assistant platform

| Question | Notes |
|----------|-------|
| HA install type? | Container (Podman quadlet), HA OS, Supervised, or existing instance |
| HA version? | 2024.x+ recommended |
| Integration install path? | e.g. `/config/custom_components/aatomhome_airbnb_welcome` |
| Will staff use HA automations for guest check-in/out? | yes/no — maps to integration services |
| Rooms / Areas already defined in HA? | List areas (Casita, Bed 2, …) for entity picker phase |

## 5. TVs to register

For each TV, collect:

| Field | Example |
|-------|---------|
| Display name | `CDO Casita` |
| IP address | `172.18.1.204` |
| Room name (for welcome screen) | `Casita` |
| HA area (optional) | `casita` |
| MAC (optional, for wake-on-LAN) | `aa:bb:cc:dd:ee:ff` |

Wireless debugging must be enabled; first pairing uses a **6-digit code** from the TV (expires ~60s).

## 6. Guest launcher APK

| Question | Default |
|----------|---------|
| Use prebuilt APK from repo? | Yes — [`guest-launcher/releases/aatomhome-guest-welcome.apk`](../guest-launcher/releases/aatomhome-guest-welcome.apk) |
| Patch hub URL into APK before deploy? | **Yes** if `HUB_PUBLIC_URL` ≠ baked-in CDO URL |
| Verify SHA256? | Compare to [`aatomhome-guest-welcome.apk.sha256`](../guest-launcher/releases/aatomhome-guest-welcome.apk.sha256) |

## 7. Post-deploy verification

Agent should run:

```bash
curl -s "$HUB_PUBLIC_URL/api/health"
curl -s "$HUB_PUBLIC_URL/api/registry"
curl -s -o /dev/null -w "%{http_code}" "$HUB_PUBLIC_URL/guest/"
```

Then open hub UI → **Connect all TVs** → register or confirm each TV.

## 8. Out of scope for first deploy

- Do not modify **CDO production** (`172.18.1.137` pinned tag) unless user explicitly requests migration
- Room control UI requires Phase 2–3 hub + HA bridge (not yet in upstream tv-hub)
