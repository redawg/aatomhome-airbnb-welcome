# Home Assistant Green — integration only

Home Assistant **Green** is a valid target for the **Aatomhome Airbnb Welcome** custom integration. It is **not** a valid host for the **tv-hub** Podman container.

## Why

tv-hub requires on the same machine:

- Podman (or Docker) with **host networking**
- Inbound/outbound ADB to TVs on the LAN (`5037`, TV debug ports)
- mDNS for wireless-debugging discovery
- Persistent `/data` volume for registry and ADB keys

HA OS on Green is an appliance OS: no supported path to run arbitrary host-network Podman stacks alongside the supervisor.

## Recommended layout

```text
┌── Property LAN ─────────────────────────────────────────┐
│  HA Green (192.168.1.10:8123)                         │
│    └── custom_components/aatomhome_airbnb_welcome       │
│                                                         │
│  Linux sibling on same LAN                              │
│    └── tv-hub container :8080 (host network)            │
│           └── ADB → Guest TVs                           │
└─────────────────────────────────────────────────────────┘
```

| Component | Host |
|-----------|------|
| Home Assistant + integration | Green `192.168.1.10` |
| tv-hub container | **Sibling Linux** — profile [`forest-lan`](../deploy/profiles/forest-lan/) |
| Standalone hub test (no local TVs) | Lab host — profile [`infra3-standalone`](../deploy/profiles/infra3-standalone/) |
| Property TVs over VPN | Lab or edge host — profile [`cdo-vpn`](../deploy/profiles/cdo-vpn/) |

## Integration setup on Green

1. Deploy tv-hub on the LAN sibling; note `HUB_PUBLIC_URL` (e.g. `http://192.168.1.100:8080`).
2. Install via HACS ([HACS.md](HACS.md)) or `./scripts/install-ha-integration.sh` with `HA_HOST=192.168.1.10`.
3. In HA: **Add integration → Aatomhome Airbnb Welcome** → enter hub URL.
4. Use HA automations for `guest_check_in`, `guest_check_out`, `connect_all_tvs`.

Hub URL in the integration must match what TVs use (see [NETWORKING.md](NETWORKING.md)).

## Example test matrix

| Test | HA | Hub | TVs |
|------|-----|-----|-----|
| Local property TVs | Green | forest-lan sibling | Same LAN |
| Integration only | Green | infra3-standalone lab host | Optional |
| Remote property LAN | Any | cdo-vpn + VPN | Property subnet |

All profiles share the same image tag and integration version — see [deploy/profiles/README.md](../deploy/profiles/README.md).
