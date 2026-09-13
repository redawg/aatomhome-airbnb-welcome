# Deploy Aatomhome Airbnb Welcome

End-to-end deployment guide for humans and AI coding agents.

## Quick start (AI agent)

### Deploy profiles (pick one)

| Profile | Command |
|---------|---------|
| **forest-lan** | `cp deploy/profiles/forest-lan/env.example deploy/profiles/forest-lan/.env` → `./scripts/deploy-profile.sh forest-lan` |
| **infra3-standalone** | `cp deploy/profiles/infra3-standalone/env.example …` → `./scripts/deploy-profile.sh infra3-standalone` |
| **cdo-vpn** | `cp deploy/profiles/cdo-vpn/env.example …` → `./scripts/deploy-profile.sh cdo-vpn` |

Verify every profile:

```bash
ENV_FILE=deploy/profiles/<profile>/.env ./scripts/verify-hub.sh
```

See [`deploy/profiles/README.md`](../deploy/profiles/README.md), [`docs/NETWORKING.md`](NETWORKING.md), [`docs/GREEN-HA.md`](GREEN-HA.md).

Legacy Forest Home path: [`deploy/forest-home/README.md`](../deploy/forest-home/README.md).

### aatomhome pilot / other host

1. Read this file and [`QUESTIONNAIRE.md`](QUESTIONNAIRE.md).
2. Ask the user every **Required** question; write answers to `deploy/.env`.
3. Follow [`.cursor/skills/aatomhome-deploy/SKILL.md`](../.cursor/skills/aatomhome-deploy/SKILL.md).
4. Run:

```bash
./scripts/build.sh    # verify container image builds
./scripts/deploy.sh   # install on host (requires deploy/.env)
```

5. Report health check results and remaining manual TV steps (wireless debugging pair, Home picker).

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Home Assistant  │────▶│ tv-hub (Podman)  │────▶│ Guest TVs   │
│ forest-ha       │     │ ADB + welcome UI │     │ WebView APK │
└─────────────────┘     └──────────────────┘     └─────────────┘
        ▲                         │
        └──── HA token ───────────┘ (Phase 3: room controls)
```

**tv-hub** is fetched from upstream [`adb-tv-hub`](https://github.com/redawg/adb-tv-hub) at tag `cdo-production-2026-09-11` into `./tv-hub/` on first deploy.

**Guest launcher APK** is prebuilt in [`guest-launcher/releases/`](../guest-launcher/releases/) (MIT license).

## Prerequisites

| Tool | Purpose |
|------|---------|
| `podman` | Run tv-hub container |
| `git` | Fetch upstream tv-hub |
| `curl` | Health checks |
| `java` + `apktool` | Only if patching APK hub URL (`PATCH_APK_HUB_URL=1`) |
| Home Assistant | Phase 1+ integration; room controls Phase 3+ |

Host must reach TV IPs on LAN (or VPN) for ADB wireless debugging.

## Configuration file

```bash
cp deploy/env.template deploy/.env
# Edit deploy/.env — see QUESTIONNAIRE.md
```

## Deploy steps (what `scripts/deploy.sh` does)

1. Validate `deploy/.env` required variables
2. `./scripts/fetch-upstream.sh` — clone/checkout adb-tv-hub tag into `tv-hub/`
3. Copy prebuilt APK into `tv-hub/guest-launcher/`
4. Optionally `./scripts/patch-apk-hub-url.sh` with `HUB_GUEST_URL`
5. `podman build` tv-hub image
6. Install Podman quadlet from `deploy/forest-ha/`
7. Copy HA integration to `$HA_CONFIG_DIR/custom_components/aatomhome_airbnb_welcome`
8. Print URLs and verification commands

## Home Assistant integration

Copy or symlink:

```bash
cp -r homeassistant/custom_components/aatomhome_airbnb_welcome \
  "$HA_CONFIG_DIR/custom_components/"
```

Restart HA → **Settings → Devices & services → Add integration** → *Aatomhome Airbnb Welcome*.

See [`homeassistant/README.md`](../homeassistant/README.md) for entities, services, and example automations.

## Manual TV steps (cannot be fully automated)

1. Enable **Developer options** → **Wireless debugging** on each TV
2. Register TV in hub UI with pairing code
3. **Provision New TV** or **Setup this TV** (installs APK from repo)
4. Press Home → select **Cielo Guest Welcome** → **Always**
5. Enable **Apps only mode** on Google TV if desired

## Verify

```bash
source deploy/.env
curl -s "$HUB_PUBLIC_URL/api/health" | python3 -m json.tool
curl -s "$HUB_PUBLIC_URL/api/registry" | python3 -m json.tool
```

## Troubleshooting

| Issue | Check |
|-------|--------|
| TV offline | Wireless debugging on? Run Connect all TVs |
| Welcome shows wrong hub | Re-patch APK; reinstall launcher |
| HA integration missing | Path `$HA_CONFIG_DIR/custom_components/`; restart HA |
| APK checksum fail | Re-download from repo; verify `.sha256` |

## Related

- Frozen CDO production (do not break): [adb-tv-hub deploy/cdo](https://github.com/redawg/adb-tv-hub/tree/main/deploy/cdo)
- Architecture roadmap: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)
