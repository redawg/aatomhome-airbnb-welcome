# TV provisioning — brand-new TV → hub at infra3 (`.36`)

Operator guide for onboarding a **new Google TV / Android TV** to the Aatomhome welcome hub. Example hub: **`http://172.16.1.36:18080`** (infra3 test deployment).

## What you are building

```text
┌─────────────┐     HTTP (welcome, claim)      ┌──────────────────┐
│  Android TV │ ─────────────────────────────► │  TV Hub (.36)    │
│  + launcher │ ◄───────────────────────────── │  admin + /guest/ │
└─────────────┘     optional: hub → TV ADB     └────────┬─────────┘
                                                          │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │ Home Assistant   │
                                                 │ (integration)    │
                                                 └──────────────────┘
```

Each TV runs the **guest launcher app** (`com.cielodeloro.guestwelcome`). On first launch it shows a **setup screen** where you:

1. Enter the **hub URL** (or scan a QR code from the hub Setup page), and  
2. Enter a **room code** from staff (or use **self-register** and approve on the hub).

After claim, the TV loads the property welcome page from `/guest/` and stays registered even if its IP changes.

---

## Prerequisites

| Item | Example (Forest / infra3 test) |
|------|--------------------------------|
| Hub running and reachable from TV LAN | `http://172.16.1.36:18080/api/health` → `{"status":"ok"}` |
| TV and hub on same LAN (or routed VPN) | TV can open hub URL in a browser |
| Hub admin UI | `http://172.16.1.36:18080/` → **Setup** tab |
| Optional: wireless debugging | For hub-driven ADB install/provision |

Firewalld on infra3 must allow the hub port (e.g. `18080/tcp`).

---

## Path A — Recommended: download APK from hub, claim on TV

Best when you are at the property with the remote. No laptop ADB required for basic onboarding.

### Step 1 — Open hub Setup

1. On a laptop/phone browser: `http://172.16.1.36:18080/`
2. Click **Setup** in the sidebar.
3. Note:
   - **Hub URL** — `http://172.16.1.36:18080`
   - **QR code** — same URL (scan with TV browser or phone; in-app QR scan is planned)
   - **Download APK** — `http://172.16.1.36:18080/api/aatomhome/guest-launcher/apk`

### Step 2 — Install launcher on the TV

**Option 2a — Download on TV (Downloader / browser)**

1. On the TV, open **Settings → Apps → Security** → enable **Install unknown apps** for your browser or Downloader app.
2. Open the TV browser (or [Downloader](https://play.google.com/store/apps/details?id=com.esaba.downloader)) and go to:
   ```text
   http://172.16.1.36:18080/api/aatomhome/guest-launcher/apk
   ```
3. Install when prompted.

**Option 2b — Sideload from laptop (ADB)**

```bash
curl -LO http://172.16.1.36:18080/api/aatomhome/guest-launcher/apk
adb connect TV_IP:5555   # after wireless debugging is on
adb install -r aatomhome-guest-welcome.apk
```

**Option 2c — Hub installs via ADB (after pair)**

Register TV in hub → **Pair device** → **Provision New TV** (hub pushes APK over ADB). See [Path B](#path-b--staff-first-adb-pair--provision).

### Step 3 — Register the TV slot on the hub

On the hub **Setup** page (or **TV Management**):

1. Click **+ Register TV**
2. Name: e.g. `Living room`
3. Host: TV IP (from TV **Settings → Network**). Port `5555` unless you use wireless debugging port.
4. Save.

### Step 4 — Get a room code

1. On **Setup**, click the TV row in the list (highlights it).
2. Click **Get room code**.
3. Copy the code (e.g. `A7K2M9`).

### Step 5 — Claim on the TV

1. Launch **Cielo / Aatomhome Guest Welcome** on the TV.
2. On the first-run screen:
   - **Hub URL override:** `http://172.16.1.36:18080`
   - **ROOM CODE:** paste the code from step 4
3. Tap **Claim on selected hub**.
4. Success → welcome screen loads from the hub.

**Alternative — self-register (no pre-created slot):**

1. On the launcher, tap **Self-register (pending approval)**.
2. On hub **Setup**, approve under **Pending approval**.

---

## Path B — Staff-first: ADB pair + provision

Use when you want the hub to install apps, set home launcher, and streaming apps in one shot.

### 1. Enable wireless debugging on the TV

1. **Settings → System → About → Android TV OS build** → click **Build** 7× → Developer options on.
2. **Settings → System → Developer options → Wireless debugging** → On.
3. **Pair device with pairing code** — note IP, pairing port, and 6-digit code (expires ~60s).

### 2. Register and pair in hub

1. **Setup** or **TV Management** → **+ Register TV** (name + TV IP).
2. **Pair device** → enter IP, pairing port, code → **Pair**.
3. **Connect** (or **Connect all TVs**).

### 3. Provision

1. Select the TV → **Provision New TV** (top action bar) or **Setup this TV**.
2. Hub installs guest launcher, sets it as Home, syncs welcome config.

You can still use the launcher claim screen later if you move the TV to another property hub.

---

## Path C — Future: Google Play

The same launcher APK will be published to Play Store. Flow will be:

1. Install **Aatomhome Guest Welcome** from Play.
2. First launch → enter hub URL or scan QR → room code or self-register.

Until Play listing is live, use **Path A** HTTP download from the hub.

---

## URLs reference (infra3 example)

| Purpose | URL |
|---------|-----|
| Admin / Setup UI | `http://172.16.1.36:18080/` |
| Guest welcome (WebView) | `http://172.16.1.36:18080/guest/` |
| Health check | `http://172.16.1.36:18080/api/health` |
| Download launcher APK | `http://172.16.1.36:18080/api/aatomhome/guest-launcher/apk` |
| Hub QR image | `http://172.16.1.36:18080/api/aatomhome/guest-launcher/hub-qr.png` |
| APK metadata | `http://172.16.1.36:18080/api/aatomhome/guest-launcher/info` |

Replace host/port with your property `HUB_PUBLIC_URL` after `configure-deploy.sh`.

---

## Home Assistant (after TV is on hub)

1. Hub **Setup** → enter **Home Assistant URL** + long-lived token → **Test connection** → **Save**.
2. In HA: **Settings → Devices & services → Add integration** → **Aatomhome Airbnb Welcome**.
3. Hub URL: `http://172.16.1.36:18080` (same as `HUB_PUBLIC_URL`).

See [HACS.md](HACS.md) for custom component install on HA Green / Forest.

---

## NVIDIA Shield (network ADB)

Shield TVs use the same guest launcher and hub flow; the hub classifies them as **NVIDIA Shield** after ADB is authorized.

| Field | Example |
|-------|---------|
| IP | `172.16.1.220` |
| ADB port | `5555` (network debugging) |
| Hub registry | Add device → **Connect** → **Provision** |

### Enable debugging on Shield

1. **Settings → Device Preferences → About** — click **Build** seven times.
2. **Settings → Device Preferences → Developer options**:
   - **USB debugging** — On
   - **Network debugging** — On (shows IP and port, usually `:5555`)
3. When the hub connects, Shield shows **Allow USB debugging?** — check **Always allow** and tap **OK**.

If the hub reports **unauthorized** and no dialog appears:

- Toggle **Network debugging** off/on for a fresh pairing prompt, or
- Use **Wireless debugging → Pair device with pairing code** — enter the 6-digit code in the hub **Pair** dialog (pairing port is shown on Shield, often `37xxx`).

### Hub-driven provision (after authorized)

```bash
# Register (once)
curl -s -X POST http://172.16.1.36:18080/api/registry \
  -H 'Content-Type: application/json' \
  -d '{"name":"NVIDIA Shield","host":"172.16.1.220","port":5555}'

# Connect + install launcher
curl -s -X POST http://172.16.1.36:18080/api/registry/1/connect
curl -s -X POST http://172.16.1.36:18080/api/registry/1/provision
```

Or use the hub UI: **Devices** → select Shield → **Connect** → **Provision New TV**.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| TV cannot download APK | TV on same LAN as `.36`? Firewall `18080` open? Try browser on phone first. |
| Shield **unauthorized** | Approve RSA on TV; or re-pair with 6-digit wireless code. `adb devices` on hub should show `device` not `unauthorized`. |
| Claim failed | Hub URL exact (no trailing `/guest/`). Room code fresh (**Get room code** again). |
| TV not in hub list | Registered? Self-register → **Approve** on Setup. |
| Hub cannot connect ADB | Wireless debugging on? Pair again. Hub must reach TV IP:port — see [NETWORKING.md](NETWORKING.md). |
| Welcome blank | Claim succeeded? Open `http://HUB/guest/` in TV browser. |
| Wrong property URL in APK | Redeploy with `PATCH_APK_HUB_URL=1` and `HUB_PUBLIC_URL` set — see [DEPLOY.md](DEPLOY.md). |

---

## Deploy hub on infra3 (operator)

```bash
cd ~/repos/aatomhome-airbnb-welcome
./scripts/configure-deploy.sh --type container \
  --host 172.16.1.36 --port 18080 \
  --public-url http://172.16.1.36:18080

ENV_FILE=deploy/profiles/container/.env ./scripts/deploy-profile.sh container
```

Verify: `curl -sf http://172.16.1.36:18080/api/aatomhome/guest-launcher/info`

---

## Related

- [NETWORKING.md](NETWORKING.md) — LAN vs VPN, ADB vs HTTP agent
- [DEPLOY.md](DEPLOY.md) — container vs HA integration deploy
- [guest-launcher/README.md](../guest-launcher/README.md) — APK package and rebuild
- Hub UI **Setup** tab — live checklist, QR, APK link, room codes
