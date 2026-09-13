# Dual-hub test framework — Forest house TV registration

Test **two connectivity paths** from the same Forest house TV without rebuilding the APK for each hub.

| Profile ID | Hub URL | Network path | Best for |
|------------|---------|--------------|----------|
| `forest-lan` | `http://172.16.255.250:8080` | TV → Forest HA LAN (often **cross-VLAN**) | Production-like: hub co-located with HA |
| `infra3` | `http://172.16.1.36:18080` | TV → fleet infra3 (**same VLAN** as many lab TVs) | ADB + agent testing when TV routes to `172.16.1.x` (`:8080` on infra3 is EcoFlow) |

**Home Assistant** (Forest `172.16.255.250:8123`) can load **two integration instances** — one per hub URL — so automations can target TVs on either backend.

## Prerequisites

1. Both hubs running the **same image tag** (`ADB_TV_HUB_TAG`) with aatomhome extensions (`GET /api/aatomhome/health`).
2. Forest TV can reach **both** URLs (routing/firewall across VLANs for `.250`; same VLAN for `.36`).
3. Guest launcher APK rebuilt from `guest-launcher/src/` **or** sideload dev build with dual-profile claim UI.

## Deploy both hubs

From a build host with fleet access:

```bash
# 1) Build image once
./scripts/build.sh

# 2) infra3 (fleet / same-VLAN test hub — default port 18080)
./scripts/configure-deploy.sh --profile infra3-standalone --force
# On infra3 or via @redhat-agent AAP:
./scripts/deploy-profile.sh infra3-standalone

# 3) Forest LAN hub (HA-adjacent)
cp deploy/profiles/forest-lan/env.example deploy/profiles/forest-lan/.env
# Set HA_LONG_LIVED_TOKEN
./scripts/deploy-profile.sh forest-lan

# 4) Verify both
ENV_FILE=deploy/profiles/infra3-standalone/.env ./scripts/verify-hub.sh
ENV_FILE=deploy/profiles/forest-lan/.env ./scripts/verify-hub.sh
```

Shortcut: `./scripts/deploy-test-framework.sh` (build + verify; fleet deploy via `@redhat-agent` when SSH from workstation fails).

## TV registration (app)

On first boot the launcher shows **Choose hub backend**:

1. Select **Forest hub** or **Infra3 hub**.
2. Optional: override hub URL.
3. **Claim on selected hub** — enter staff claim code (`POST /api/registry/claim-by-code`).
4. Repeat for the **other** profile to register the same physical TV on both hubs (separate registry rows / device IDs).

After claim:

- **Menu / Info** on remote → switch active welcome hub.
- `TvAgentService` polls **every claimed profile** for guest commands.

### Staff: create claim codes

On each hub admin UI or API:

```bash
# After creating TV slot (host = TV IP)
curl -X POST "http://HUB/api/registry/DEVICE_ID/prepare-claim"
```

Approve self-register:

```bash
curl "http://HUB/api/registry/pending"
curl -X POST "http://HUB/api/registry/pending/PENDING_ID/approve"
```

## Home Assistant (two backends)

1. **Settings → Integrations → Add → Aatomhome Airbnb Welcome**
2. First entry: hub URL `http://172.16.255.250:8080` — name e.g. `Forest Hub`
3. Second entry: hub URL `http://172.16.1.36:18080` — name e.g. `Infra3 Test Hub`

Each instance exposes its own TV online sensors and services. Room names in **Configure** sync to that hub’s `room-config`.

## Test matrix

| Step | Forest hub | Infra3 hub |
|------|------------|------------|
| Health | `curl http://172.16.255.250:8080/api/aatomhome/health` | `curl http://172.16.1.36:18080/api/aatomhome/health` |
| TV claim | App → forest-lan profile + code | App → infra3 profile + code |
| Welcome HTTP | TV loads `…250:8080/guest/` | TV loads `…36:18080/guest/` |
| ADB connect | Hub → TV if routed | Hub → TV on same VLAN |
| Guest checkout | HA → forest integration `guest_check_out` | HA → infra3 integration `guest_check_out` |
| Agent path | `clear_streaming` via poll/WS | same |

## ADB intent extras (provision without UI)

```bash
adb shell am start -n com.cielodeloro.guestwelcome/.MainActivity \
  --es hub_profile forest-lan \
  --es hub_url http://172.16.255.250:8080/guest/

adb shell am start -n com.cielodeloro.guestwelcome/.MainActivity \
  --es hub_profile infra3 \
  --es hub_url http://172.16.1.36:18080/guest/
```
