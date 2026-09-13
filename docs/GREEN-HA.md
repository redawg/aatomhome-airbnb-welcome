# Home Assistant Green — integration only

Home Assistant **Green** is a valid target for the **Aatomhome Airbnb Welcome** custom integration. It is **not** a valid host for the **tv-hub** Podman container.

## Why

tv-hub requires on the same machine:

- Podman (or Docker) with **host networking**
- Inbound/outbound ADB to TVs on the LAN (`5037`, TV debug ports)
- mDNS for wireless-debugging discovery
- Persistent `/data` volume for registry and ADB keys

HA OS on Green is an appliance OS: no supported path to run arbitrary host-network Podman stacks alongside the supervisor.

## Recommended Forest / Green layout

```text
┌── Forest Home LAN ──────────────────────────────────────┐
│  HA Green or Forest HA (172.16.255.250:8123)            │
│    └── custom_components/aatomhome_airbnb_welcome       │
│                                                         │
│  Linux sibling (or Forest HA host if non–HA OS)         │
│    └── tv-hub container :8080 (host network)            │
│           └── ADB → Guest TVs                           │
└─────────────────────────────────────────────────────────┘
```

| Component | Host |
|-----------|------|
| Home Assistant + integration | Green or Forest HA `172.16.255.250` |
| tv-hub container | **Sibling Linux on same LAN** — profile [`forest-lan`](../deploy/profiles/forest-lan/) |
| Standalone hub test (no local TVs) | infra3 `172.16.1.36` — profile [`infra3-standalone`](../deploy/profiles/infra3-standalone/) |
| CDO TVs over VPN | infra3 or aatomhome — profile [`cdo-vpn`](../deploy/profiles/cdo-vpn/) |

## Integration setup on Green

1. Deploy tv-hub on the LAN sibling; note `HUB_PUBLIC_URL` (e.g. `http://192.168.x.x:8080`).
2. Copy integration: `./scripts/install-ha-integration.sh` with `HA_HOST=172.16.255.250`.
3. In HA: **Add integration → Aatomhome Airbnb Welcome** → enter hub URL.
4. Use HA automations for `guest_check_in`, `guest_check_out`, `connect_all_tvs`.

Hub URL in the integration must match what TVs use (see [NETWORKING.md](NETWORKING.md)).

## Testing matrix (Andrew)

| Test | HA | Hub | TVs |
|------|-----|-----|-----|
| Local Forest TVs | Green / Forest HA | forest-lan sibling | Same LAN |
| Integration only | Green | infra3 `.36` | Optional |
| CDO pilot | Any | cdo-vpn `.36` + VPN | `172.18.1.x` |

All profiles share the **same image tag** and integration version — see [deploy/profiles/README.md](deploy/profiles/README.md).
