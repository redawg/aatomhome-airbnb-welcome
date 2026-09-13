# TV provisioning — two paths

Onboard a **Google TV, Android TV, or NVIDIA Shield** to the Aatomhome welcome hub. Example hub: **`http://172.16.1.36:18080`** (infra3 test).

| Path | When to use | TV needs dev options? | Hub pushes APK? |
|------|-------------|----------------------|-----------------|
| **1 — Download app** | Default · property install with remote only | **No** | No — TV installs APK |
| **2 — Hub via ADB** | Staff setup · lockdown · streaming apps | **Yes** | Yes |

Both paths end with the **guest launcher** (`com.cielodeloro.guestwelcome`) loading the welcome page from the hub (`/guest/`).

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
| Hub reachable from TV LAN | `http://172.16.1.36:18080/api/health` → `{"status":"ok"}` |
| Hub Setup UI | `http://172.16.1.36:18080/` → **Setup** |
| Firewall | `18080/tcp` open on hub host |

---

## Path 1 — Download app (recommended)

**No developer options.** Staff prepares a room code on the hub; the TV installs the launcher and claims over HTTP.

### Staff (hub Setup)

1. Open **Setup** → **Path 1 — Download app**.
2. Click **+ Create room slot** → name the room (e.g. `Living room Shield`).
3. Copy the **room code** shown (or select the slot → **Show room code**).
4. Note for the TV:
   - **Hub URL:** `http://172.16.1.36:18080`
   - **APK:** `http://172.16.1.36:18080/api/aatomhome/guest-launcher/apk`

**Alternative — self-register (no pre-created slot):** skip room slot; on the TV use **Self-register** in the launcher → approve under **Pending approval** on Setup.

### On the TV

1. **Install unknown apps** — enable for your browser or [Downloader](https://play.google.com/store/apps/details?id=com.esaba.downloader).
2. Open the APK URL in the TV browser or Downloader → install.
3. Launch **Aatomhome / Cielo Guest Welcome**.
4. **Hub URL:** `http://172.16.1.36:18080` (or scan QR on hub Setup).
5. **Room code** from staff → **Claim on selected hub**.
6. Welcome screen loads from the hub.

### API (optional)

```bash
# Create room slot
curl -s -X POST http://172.16.1.36:18080/api/aatomhome/registry/app-slot \
  -H 'Content-Type: application/json' \
  -d '{"name":"Living room"}'

# TV claims (from launcher)
curl -s -X POST http://172.16.1.36:18080/api/registry/claim-by-code \
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

**NVIDIA Shield**

1. **Settings → Device Preferences → About** → click **Build** 7×.
2. **Developer options** → **USB debugging** + **Network debugging** → On.
3. Approve **Allow USB debugging** when the hub connects (or use wireless pairing code).

### 2. Register and connect (hub)

1. **Setup** → **Path 2** → **Register for ADB** (name + TV IP).
2. **Pair device** — pairing port + 6-digit code (if not paired at register).
3. **TV Management** → select TV → **Connect** (status must be `device`, not `unauthorized`).

### 3. Provision

1. **Provision New TV** or **Setup this TV** (TV Management / Guest Experience).
2. Hub pushes APK, sets guest launcher as Home, applies welcome config.

You can still use **Path 1 claim** after ADB install if you prefer HTTP binding to a room slot.

### API (optional)

```bash
curl -s -X POST http://172.16.1.36:18080/api/registry \
  -H 'Content-Type: application/json' \
  -d '{"name":"NVIDIA Shield","host":"172.16.1.220","port":5555}'

curl -s -X POST http://172.16.1.36:18080/api/registry/1/connect
curl -s -X POST http://172.16.1.36:18080/api/registry/1/provision
```

---

## URLs (infra3 example)

| Purpose | URL |
|---------|-----|
| Admin / Setup | `http://172.16.1.36:18080/` |
| Guest welcome | `http://172.16.1.36:18080/guest/` |
| Health | `http://172.16.1.36:18080/api/health` |
| Download APK | `http://172.16.1.36:18080/api/aatomhome/guest-launcher/apk` |
| Hub QR | `http://172.16.1.36:18080/api/aatomhome/guest-launcher/hub-qr.png` |
| Create app slot | `POST /api/aatomhome/registry/app-slot` |

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
