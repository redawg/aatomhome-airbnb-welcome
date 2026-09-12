# Third-party notices — guest launcher

## Prebuilt APK (`releases/aatomhome-guest-welcome.apk`)

Built from open-source patches in this directory applied to a minimal Android TV WebView launcher template.  
Copyright (c) 2026 Aatomhome — licensed under **MIT** ([../LICENSE](../LICENSE)).

Components inside the APK:

| Component | License | Notes |
|-----------|---------|--------|
| Kotlin/Java sources in `src/` | MIT | MainActivity, GuestLauncherBridge |
| Java/smali patches in `patches/` | MIT | BootReceiver, WelcomeAccessibilityService, manifest fragments |
| Android platform / WebView | AOSP / Google terms | Runtime on device |
| Debug signing keystore | N/A | `CN=Android Debug` — replace for production store release if needed |

## adb-auto-enable (optional TV helper)

Not bundled in this APK. When deploying tv-hub, optional helper APK from  
[mouldybread/adb-auto-enable](https://github.com/mouldybread/adb-auto-enable) (check upstream license).

## Hub welcome web app

Served by tv-hub at `/guest/` — MIT, from upstream [adb-tv-hub](https://github.com/redawg/adb-tv-hub).
