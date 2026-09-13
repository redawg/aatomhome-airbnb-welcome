# Guest welcome launcher (Android TV)

Pre-built APK that sets **Guest Welcome** as the TV home app and loads the hub welcome page in a WebView.

## Precompiled release

| File | Description |
|------|-------------|
| [`releases/aatomhome-guest-welcome.apk`](releases/aatomhome-guest-welcome.apk) | Signed debug keystore; ready to sideload or install via hub ADB |
| [`releases/aatomhome-guest-welcome.apk.sha256`](releases/aatomhome-guest-welcome.apk.sha256) | SHA-256 checksum |

**Package:** `com.cielodeloro.guestwelcome`  
**Default hub URL baked in:** `http://192.168.2.1:8080/guest/` — patch at deploy time with [`../scripts/patch-apk-hub-url.sh`](../scripts/patch-apk-hub-url.sh) and `HUB_PUBLIC_URL`.

**Multi-property / claim flow (source):** `HubConfig.kt` persists `hub_url` per TV; first boot shows room-code claim (`POST /api/registry/claim-by-code`) or self-register (`POST /api/registry/self-register`). `TvAgentService` polls the hub for guest ops when inbound ADB is unavailable.

## License

- Launcher **source** (`src/`, `patches/`) — **MIT** (see [../LICENSE](../LICENSE))
- Prebuilt **APK** — MIT, same as source; redistribute with LICENSE included
- Android/WebView/system APIs — respective platform licenses

See [NOTICE.md](NOTICE.md) for third-party components.

## Rebuild from source

Requires Java, apktool, and a base APK (or rebuild pipeline from upstream adb-tv-hub):

```bash
HUB_PUBLIC_URL=http://YOUR-HUB:8080/guest/ ../scripts/patch-apk-hub-url.sh
```

Full rebuild with boot receiver and accessibility service: use upstream  
[`adb-tv-hub/scripts/rebuild-guest-launcher-apk.sh`](https://github.com/redawg/adb-tv-hub/blob/cdo-production-2026-09-11/scripts/rebuild-guest-launcher-apk.sh).

## Install on a TV

Two provisioning paths — see [docs/TV-PROVISIONING.md](../docs/TV-PROVISIONING.md).

**Path 1 — Download app (no dev options):**

```text
http://<HUB_HOST>:<PORT>/api/aatomhome/guest-launcher/apk
```

Hub **Setup → Create room slot** → install APK on TV → hub URL + room code → Claim.

**Path 2 — Hub via ADB:** developer options → register → pair → **Provision New TV**.

**Manual ADB:**

```bash
adb install -r releases/aatomhome-guest-welcome.apk
adb shell cmd package set-home-activity com.cielodeloro.guestwelcome/.MainActivity
```

On first Home press, choose **Guest Welcome** → **Always**.

### First-run flow (launcher app)

1. **Hub URL** — type `http://192.168.1.100:18080` (or scan QR from hub Setup page).
2. **Room code** — from hub staff (**Setup → select TV → Get room code**), or **Self-register** and approve on hub.
3. After claim → welcome WebView loads `/guest/` from the hub.

QR on hub encodes the hub base URL. In-app camera QR scan is planned; today use manual URL entry or open the QR link on a phone and type the URL on the TV.
