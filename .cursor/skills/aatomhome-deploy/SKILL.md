---
name: aatomhome-deploy
description: >-
  Deploy Aatomhome Airbnb welcome (tv-hub + guest launcher APK + Home Assistant
  integration). Use when deploying this repo, setting up forest-ha, configuring
  HA tokens, API keys, or installing the prebuilt Android guest launcher APK.
---

# Aatomhome Airbnb Welcome — deployment skill

Use this skill when the user asks to deploy, install, or configure this project on a new host (Forest Home, forest-ha/aatomhome, or a property LAN).

## Forest Home (172.16.255.250) — default for Forest HA

```bash
cp deploy/forest-home/env.example deploy/forest-home/.env
# HA_LONG_LIVED_TOKEN from vault ha_token
./scripts/deploy-forest-home.sh
./scripts/verify-hub.sh
```

Docs: [`deploy/forest-home/README.md`](../../deploy/forest-home/README.md)

## Before running anything

1. Read [`deploy/QUESTIONNAIRE.md`](deploy/QUESTIONNAIRE.md) and [`docs/DEPLOY.md`](docs/DEPLOY.md).
2. Ask the user for every **Required** item in the questionnaire. Do not invent IPs, tokens, or URLs.
3. Write answers to `deploy/.env` (copy from [`deploy/env.template`](deploy/env.template)).
4. Confirm the user is **not** asking you to modify frozen CDO production unless they explicitly say so.

## Required questions (short form)

Ask in conversation if `deploy/.env` is missing:

| Topic | Variables |
|-------|-----------|
| Hub URL TVs will load | `HUB_PUBLIC_URL`, `HUB_GUEST_URL` |
| Deploy host | `DEPLOY_HOST`, `PODMAN_MODE` |
| HA instance | `HA_URL`, `HA_CONFIG_DIR`, `HA_LONG_LIVED_TOKEN` |
| Weather (optional) | `TEMPEST_API_TOKEN`, `TEMPEST_STATION_ID` |
| Network | Can hub reach TV subnet? |
| TVs | Name + IP per TV; pairing codes at register time |

## Deploy command

From repo root, after `deploy/.env` exists:

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh
```

## What gets installed

| Component | Source |
|-----------|--------|
| tv-hub container | Upstream `adb-tv-hub` @ `ADB_TV_HUB_TAG` → `./tv-hub/` |
| Guest launcher APK | [`guest-launcher/releases/aatomhome-guest-welcome.apk`](guest-launcher/releases/aatomhome-guest-welcome.apk) (MIT) |
| HA integration | [`homeassistant/custom_components/aatomhome_airbnb_welcome/`](homeassistant/custom_components/aatomhome_airbnb_welcome/) |

## APK hub URL

Default APK bakes in `http://172.18.1.137:8080/guest/`. If user's `HUB_PUBLIC_URL` differs, set `PATCH_APK_HUB_URL=1` in `deploy/.env` before deploy (runs `scripts/patch-apk-hub-url.sh`).

Verify checksum:

```bash
sha256sum -c guest-launcher/releases/aatomhome-guest-welcome.apk.sha256
```

## Post-deploy checks

```bash
source deploy/.env
curl -s "$HUB_PUBLIC_URL/api/health"
curl -s "$HUB_PUBLIC_URL/api/registry"
```

Tell the user to complete manual TV steps: wireless debugging pair, Home → Cielo Guest Welcome → Always.

## HA platform notes

- **Long-lived token**: HA Profile → Security → Long-Lived Access Tokens → Create Token.
- **Integration path**: `$HA_CONFIG_DIR/custom_components/aatomhome_airbnb_welcome`
- Restart Home Assistant after copying integration files.
- Room controls (lights, fan, blinds) require Phase 3 hub bridge — not in upstream tv-hub yet; set expectations.

## Secrets

- Never commit `deploy/.env`
- Never print full tokens in chat logs; confirm set-only

## If deploy fails

| Error | Action |
|-------|--------|
| `podman: command not found` | Install podman; on Fedora: `dnf install podman` |
| Hub cannot reach TVs | Fix VPN/routing; confirm `HUB_PUBLIC_URL` reachable from TV browser |
| APK patch fails | Install Java; or set `PATCH_APK_HUB_URL=0` and use ADB `am start --es hub_url` |
| HA token 401 | Regenerate long-lived token; check `HA_URL` |

## Reference files

- Questionnaire: [`deploy/QUESTIONNAIRE.md`](deploy/QUESTIONNAIRE.md)
- Env template: [`deploy/env.template`](deploy/env.template)
- APK license: [`LICENSE`](LICENSE), [`guest-launcher/NOTICE.md`](guest-launcher/NOTICE.md)
