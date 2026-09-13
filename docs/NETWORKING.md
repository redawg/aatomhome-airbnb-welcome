# Networking — tv-hub, TVs, and Home Assistant

Operators and installers: use this matrix before choosing where the hub runs and what guests can do remotely.

## Traffic directions

| Direction | Protocol | Who initiates |
|-----------|----------|---------------|
| Hub → TV | ADB (TCP to wireless-debug port) | **Hub** |
| TV → Hub | HTTP / WebSocket (welcome, agent) | **TV** |
| Hub → HA | HTTP REST (room controls, Phase 3+) | **Hub** |
| HA → Hub | HTTP REST (integration, automations) | **HA** |

## What requires LAN or site VPN (hub can reach TV IP)

The hub **must** open TCP to each TV’s wireless-debugging address (`host:port`, often `5555+`). Use the **same LAN** or a **site-to-site VPN** that routes TV subnets to the hub host.

Required for:

- First-time wireless pairing and provisioning
- `connect-all` / per-TV connect
- Apps-only mode and deep `pm clear` via ADB shell
- Play Store–assisted streaming app installs
- mDNS discovery (helpful; fixed port works without mDNS)

**Do not** tell users that a VPN *inside* the Android TV app replaces this. A VPN on the TV does not make the TV’s debug port reachable from the hub.

## What works off-LAN (TV reaches hub over internet or DNS)

If `HUB_PUBLIC_URL` is reachable from the TV network (public HTTPS, Tailscale, etc.):

- Guest welcome WebView (`/guest/`)
- Room control tiles (Phase 3 — hub proxies HA)
- **TV command agent** (outbound WebSocket) — clear streaming logins, status, without inbound ADB

## Approach comparison

| Approach | Welcome HTTP | Hub → TV ADB | Guest checkout off-LAN |
|----------|--------------|--------------|-------------------------|
| Hub on property LAN | Yes | Yes | Yes (ADB or agent) |
| Hub remote + **site VPN** to TV LAN | Yes | Yes | Yes |
| Hub remote, no VPN | Yes (if URL public) | **No** | **TV agent only** |
| VPN inside TV app | Maybe | **No** | Partial — avoid |
| HTTP proxy in TV app only | Yes | **No** | Partial |

**Recommended remote pattern:** UniFi / Tailscale **subnet router** at the property, or hub on a small Linux box on the property LAN (see [deploy/profiles/](deploy/profiles/)).

## TV identity on the welcome page

Today the hub maps **HTTP client IP → registry row** (`GET /api/guest-welcome/public`). The TV and hub must agree on the network path (same LAN, or NAT hairpin if the TV uses the public URL).

**Claim flow** (extensions): TV binds to a pre-created slot with a room code so IP drift is less critical after claim.

## Multi-property hub URLs

Each property needs a stable `HUB_PUBLIC_URL` for APK, DNS, and HA integration:

| Profile | Example hub URL |
|---------|-----------------|
| forest-lan | `http://172.16.255.250:8080` or LAN DNS |
| infra3-standalone | `http://172.16.1.36:18080` (default; configure with `configure-deploy.sh`) |
| cdo-vpn | `http://172.16.1.36:18080` or on-site `http://172.18.1.137:8080` |

See [deploy/profiles/README.md](deploy/profiles/README.md) and guest launcher `HubConfig` (saved hub URL after claim).

## HA Green

Home Assistant Green runs HA OS — **not** a supported tv-hub host (no reliable Podman + host network + mDNS). Run the **container on a sibling Linux host** on the same LAN; use Green (or Forest HA) **only** for the custom integration.

See [GREEN-HA.md](GREEN-HA.md).

## Related

- [DEPLOY.md](DEPLOY.md) — install steps
- [ARCHITECTURE.md](ARCHITECTURE.md) — components and phases
- [deploy/profiles/README.md](deploy/profiles/README.md) — three deploy profiles
