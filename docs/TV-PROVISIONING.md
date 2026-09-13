# TV provisioning — two paths

Onboard a **Google TV, Android TV, or Android TV device** to the Aatomhome welcome hub. Example hub: **`http://192.168.1.100:18080`** (lab hub).

| Path | When to use | TV needs dev options? | Hub pushes APK? |
|------|-------------|----------------------|-----------------|
| **1 — Download app** | Default · property install with remote only | **No** | No — TV installs APK |
| **2 — Hub via ADB** | Staff setup · lockdown · streaming apps | **Yes** | Yes |

Both paths end with the **guest launcher** (`com.cielodeloro.guestwelcome`) loading the welcome page from the hub (`/guest/`).

The welcome screen does **not** ship static copy on the TV. It loads live JSON from **`GET /api/guest-welcome/public`** on the **same hub** the launcher claimed (via `/guest/hub-config.js`). Content comes from **Setup → Guest Experience** for the TV’s property (matched by registered TV IP, or hub **active property** when previewing in the admin UI).

---

## Architecture

```text
┌─────────────┐     HTTP (APK, claim, welcome)     ┌──────────────────┐
│  Android TV │ ◄────────────────────────────────► │  TV Hub          │
│  + launcher │     optional Path 2 only:          │  admin + /guest/ │
└─────────────┘     hub ──ADB──► TV               └────────┬─────────┘
                                                            │
                                                            ▼
                                                   ┌──────────────────┐
                                                   │ Home Assistant   │
                                                   └──────────────────┘
```

**Path 1** is HTTP-only after the APK is on the TV. **Path 2** adds hub → TV ADB for install, Home launcher, and advanced guest ops.

---

## Prerequisites (both paths)

| Item | Example |
|------|---------|
| Hub reachable from TV LAN | `http://192.168.1.100:18080/api/health` → `{"status":"ok"}` |
| Hub Setup UI | `http://192.168.1.100:18080/` → **Setup** |
| Firewall | `18080/tcp` open on hub host |

---

## Guest Google account (main TV profile)

Streaming apps, allow-list sync, and **Clear streaming logins** all target the TV **main profile** (Android user **0** — owner / primary user on Google TV and Android TV). Configure the account per property in hub **Setup → Hub → TV Google account**.

| Field | What to use |
|-------|-------------|
| **Google account** | Property guest account from Setup (e.g. `guest@example.com`) |
| **Android profile** | **Main profile only** — not a child or restricted profile |
| **When to sign in** | Before Path 2 push / streaming install; recommended before Path 1 claim if guests will use Netflix, Disney+, etc. |

On the TV: **Settings → Accounts** → add or switch to the primary profile → sign in with the hub-configured email. The hub **Guest Experience** tab shows whether the selected TV has the expected account on the main profile.

---

## Path 1 — Download app (recommended)

**No developer options.** Staff prepares a room code on the hub; the TV installs the launcher and claims over HTTP.

### Staff (hub Setup)

1. Open **Setup** → confirm **TV Google account** and **Guest TV sign-in** box (main profile · user 0).
2. Open **Path 1 — Download app**.
3. Click **+ Create room slot** → name the room (e.g. `Living room Shield`).
4. Copy the **room code** shown (or select the slot → **Show room code**).
5. Note for the TV:
   - **Hub URL:** `http://192.168.1.100:18080`
   - **APK:** `http://192.168.1.100:18080/api/aatomhome/guest-launcher/apk`

**Alternative — self-register (no pre-created slot):** skip room slot; on the TV use **Self-register** in the launcher → approve under **Pending approval** on Setup.

### On the TV

1. **Main profile:** sign in with the property guest Google account from Setup (if guests will use streaming apps).
2. **Install unknown apps** — enable for your browser or [Downloader](https://play.google.com/store/apps/details?id=com.esaba.downloader).
3. Open the APK URL in the TV browser or Downloader → install.
4. Launch **Aatomhome / Guest Welcome**.
5. **Hub URL:** `http://192.168.1.100:18080` (or scan QR on hub Setup).
6. **Room code** from staff → **Claim on selected hub**.
7. Welcome screen loads from the hub.

### API (optional)

```bash
# Create room slot
curl -s -X POST http://192.168.1.100:18080/api/aatomhome/registry/app-slot \
  -H 'Content-Type: application/json' \
  -d '{"name":"Living room"}'

# TV claims (from launcher)
curl -s -X POST http://192.168.1.100:18080/api/registry/claim-by-code \
  -H 'Content-Type: application/json' \
  -d '{"claim_code":"ABC123"}'
```

---

## Path 2 — Hub pushes via ADB

**Developer options required.** Hub installs the APK, can set default Home, streaming apps, and lockdown. Use for Google TV Streamer, Shield with network debugging, or when you want zero manual sideloading.

### 1. Enable debugging on the TV

**Google TV / Android TV**

1. **Settings → System → About** → click **Build** 7×.
2. **Developer options → Wireless debugging** → On.
3. **Pair device with pairing code** — note IP, pairing port, 6-digit code (expires ~60s).

**Android TV device**

1. **Settings → Device Preferences → About** → click **Build** 7×.
2. **Developer options** → **USB debugging** + **Network debugging** → On.
3. Approve **Allow USB debugging** when the hub connects (or use wireless pairing code).

### 2. Guest sign-in (TV)

1. On the TV **main profile**, sign in with the **TV Google account** from hub Setup (see **Guest TV sign-in** on the Provision card).

### 3. Register and connect (hub)

1. **Setup** → **Path 2** → **Register for ADB** (name + TV IP).
2. **Pair device** — pairing port + 6-digit code (if not paired at register).
3. **TV Management** → select TV → **Connect** (status must be `device`, not `unauthorized`).

### 4. Push welcome app (after Connect shows **device**)

1. **TV Management** → select the TV → **Push welcome app**
2. After hub APK rebuild → **Update launcher APK** (or **Push to all online**)

Optional full CDO/Google TV lockdown: **Provision New TV (full)**.

### API (optional)

```bash
curl -s -X POST http://192.168.1.100:18080/api/registry \
  -H 'Content-Type: application/json' \
  -d '{"name":"Android TV device","host":"192.168.1.50","port":5555}'

curl -s -X POST http://192.168.1.100:18080/api/registry/1/connect

curl -s -X POST http://192.168.1.100:18080/api/aatomhome/registry/1/deploy-launcher \
  -H 'Content-Type: application/json' \
  -d '{"set_home":true,"launch_welcome":true,"force_reinstall":true}'
```

---

## URLs (lab host example)

| Purpose | URL |
|---------|-----|
| Admin / Setup | `http://192.168.1.100:18080/` |
| Guest welcome | `http://192.168.1.100:18080/guest/` |
| Health | `http://192.168.1.100:18080/api/health` |
| Download APK | `http://192.168.1.100:18080/api/aatomhome/guest-launcher/apk` |
| Hub QR | `http://192.168.1.100:18080/api/aatomhome/guest-launcher/hub-qr.png` |
| Create app slot | `POST /api/aatomhome/registry/app-slot` |
| Push welcome app (ADB) | `POST /api/aatomhome/registry/{id}/deploy-launcher` |
| Push to all online TVs | `POST /api/aatomhome/registry/deploy-launcher` |

---

## Home Assistant (after TV is on hub)

1. Hub **Setup** → HA URL + token → **Test** → **Save**.
2. In HA: **Add integration** → **Aatomhome Airbnb Welcome** → hub URL.

See [HACS.md](HACS.md).

---

## Troubleshooting

| Symptom | Path | Fix |
|---------|------|-----|
| TV cannot download APK | 1 | Same LAN? Firewall `18080`? Try phone browser first. |
| Invalid claim code | 1 | Fresh **Show room code**; codes are per slot. |
| Self-register stuck | 1 | Approve on Setup → **Pending approval**. |
| Shield **unauthorized** | 2 | Approve RSA on TV; toggle network debugging. |
| Hub cannot connect ADB | 2 | Pair again; check IP:port — [NETWORKING.md](NETWORKING.md). |
| Welcome blank | both | Claim succeeded? Open `http://HUB/guest/` in TV browser. |

---

## Future — Google Play

Same launcher from Play Store → Path 1 only (hub URL + room code). Until then, use HTTP APK from the hub.

---

## Related

- [NETWORKING.md](NETWORKING.md) — LAN, VPN, ADB vs HTTP
- [DEPLOY.md](DEPLOY.md) — hub container deploy
- [guest-launcher/README.md](../guest-launcher/README.md) — APK rebuild
- Hub **Setup** tab — live two-path wizard, QR, APK, room codes
