# Guest welcome launcher (Android TV)

Pre-built APK that sets **Cielo / Aatomhome Guest Welcome** as the TV home app and loads the hub welcome page in a WebView.

## Precompiled release

| File | Description |
|------|-------------|
| [`releases/aatomhome-guest-welcome.apk`](releases/aatomhome-guest-welcome.apk) | Signed debug keystore; ready to sideload or install via hub ADB |
| [`releases/aatomhome-guest-welcome.apk.sha256`](releases/aatomhome-guest-welcome.apk.sha256) | SHA-256 checksum |

**Package:** `com.cielodeloro.guestwelcome`  
**Default hub URL baked in:** `http://172.18.1.137:8080/guest/` — patch at deploy time with [`../scripts/patch-apk-hub-url.sh`](../scripts/patch-apk-hub-url.sh) and `HUB_PUBLIC_URL`.

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

Via hub (recommended): register TV → **Provision New TV** or **Setup this TV**.

Manual ADB:

```bash
adb install -r releases/aatomhome-guest-welcome.apk
adb shell cmd package set-home-activity com.cielodeloro.guestwelcome/.MainActivity
```

On first Home press, choose **Cielo Guest Welcome** → **Always**.
