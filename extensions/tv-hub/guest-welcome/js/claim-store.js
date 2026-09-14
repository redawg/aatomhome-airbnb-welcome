/**
 * TV ↔ hub claim state — WebView localStorage + Android SharedPreferences (GuestLauncher).
 */
(function (global) {
  const FINGERPRINT_KEY = "aatom_tv_fingerprint";
  const HUB_BASE_KEY = "aatom_hub_base_url";
  const DEFAULT_HUB_BASE = "http://172.16.1.36:18080";
  let memoryFingerprint = null;

  /** HTTP WebViews (Shield guest app) often lack crypto.randomUUID — use native ID or a manual fallback. */
  function newFingerprintSuffix() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_) { /* insecure context */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function normalizeHubBase(raw) {
    let base = String(raw || "").trim();
    if (!base) return "";
    base = base.replace(/\/+$/, "");
    base = base.replace(/\/guest\/onboard\/?$/i, "");
    base = base.replace(/\/guest\/?$/i, "");
    return base.replace(/\/+$/, "");
  }

  /** infra3: port 8080 is other MCP services — tv-hub is always 18080. */
  function migrateHubBase(base) {
    const b = normalizeHubBase(base);
    if (!b) return b;
    if (/^http:\/\/172\.16\.1\.36:8080$/i.test(b)) {
      return "http://172.16.1.36:18080";
    }
    return b;
  }

  function readNativeClaim() {
    try {
      if (typeof GuestLauncher === "undefined" || !GuestLauncher.getClaimState) return null;
      const raw = GuestLauncher.getClaimState();
      const native = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!native?.claimed || !native.device_id || native.device_id < 1) return null;
      if (!native.device_session) return null;
      return native;
    } catch (_) {
      return null;
    }
  }

  function persistToNative(hub, record) {
    try {
      if (typeof GuestLauncher === "undefined" || !GuestLauncher.saveClaimState) return;
      GuestLauncher.saveClaimState(JSON.stringify({
        hub_url: hub,
        device_id: record.device_id,
        device_session: record.device_session,
        device_fingerprint: getFingerprint(),
        claim_code: record.claim_code || null,
        claimed: true,
      }));
    } catch (_) { /* APK shell unavailable */ }
  }

  function clearNativeClaim() {
    try {
      if (typeof GuestLauncher !== "undefined" && GuestLauncher.clearClaimState) {
        GuestLauncher.clearClaimState();
      }
    } catch (_) { /* ignore */ }
  }

  function getHubBase() {
    let resolved = "";
    try {
      const stored = localStorage.getItem(HUB_BASE_KEY);
      if (stored) resolved = migrateHubBase(stored);
    } catch (_) { /* quota */ }
    if (!resolved) {
      const native = readNativeClaim();
      if (native?.hub_url) resolved = migrateHubBase(native.hub_url);
    }
    if (!resolved && global.HUB_BASE_URL) resolved = migrateHubBase(global.HUB_BASE_URL);
    if (!resolved) {
      const host = global.location?.hostname;
      if (host && host !== "localhost" && host !== "127.0.0.1") {
        resolved = migrateHubBase(global.location.origin);
      }
    }
    if (!resolved) resolved = DEFAULT_HUB_BASE;
    if (resolved !== localStorage.getItem(HUB_BASE_KEY)) {
      try {
        localStorage.setItem(HUB_BASE_KEY, resolved);
      } catch (_) { /* quota */ }
    }
    return resolved;
  }

  function setHubBase(url) {
    const base = migrateHubBase(url) || DEFAULT_HUB_BASE;
    try {
      localStorage.setItem(HUB_BASE_KEY, base);
    } catch (_) { /* quota */ }
    return base;
  }

  function clearHubBase() {
    try {
      localStorage.removeItem(HUB_BASE_KEY);
    } catch (_) { /* ignore */ }
  }

  function hubKey(hub) {
    const base = String(hub || "").replace(/\/$/, "");
    return `aatom_tv_claim_${base.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120)}`;
  }

  function getFingerprint() {
    try {
      if (typeof GuestLauncher !== "undefined" && GuestLauncher.getDeviceFingerprint) {
        const stable = String(GuestLauncher.getDeviceFingerprint() || "").trim();
        if (stable) {
          localStorage.setItem(FINGERPRINT_KEY, stable);
          return stable;
        }
      }
      let fp = localStorage.getItem(FINGERPRINT_KEY);
      if (!fp) {
        const native = readNativeClaim();
        fp = native?.device_fingerprint || null;
      }
      if (!fp) {
        fp = memoryFingerprint || `tv-${newFingerprintSuffix()}`;
        memoryFingerprint = fp;
        localStorage.setItem(FINGERPRINT_KEY, fp);
      }
      return fp;
    } catch (_) {
      if (!memoryFingerprint) memoryFingerprint = `tv-${newFingerprintSuffix()}`;
      return memoryFingerprint;
    }
  }

  function loadClaim(hub) {
    const base = normalizeHubBase(hub || getHubBase());
    try {
      const raw = localStorage.getItem(hubKey(base));
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.device_id && data?.device_session) return data;
      }
    } catch (_) { /* parse */ }
    const native = readNativeClaim();
    if (!native) return null;
    const nativeHub = normalizeHubBase(native.hub_url || base);
    if (nativeHub && nativeHub !== base) {
      // Claim exists for a different hub base — still hydrate the matching key.
      return hydrateNativeClaim(nativeHub) || null;
    }
    return hydrateNativeClaim(base);
  }

  function saveClaim(hub, payload) {
    const base = normalizeHubBase(hub || getHubBase());
    setHubBase(base);
    const record = {
      device_id: payload.device_id,
      device_session: payload.device_session || null,
      claim_code: payload.claim_code || null,
      room_name: payload.room_name || "",
      room_config: payload.room_config || null,
      claimed_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(hubKey(base), JSON.stringify(record));
    } catch (_) { /* quota */ }
    if (payload.device_fingerprint) {
      try {
        localStorage.setItem(FINGERPRINT_KEY, payload.device_fingerprint);
        memoryFingerprint = payload.device_fingerprint;
      } catch (_) { /* ignore */ }
    }
    persistToNative(base, record);
    return record;
  }

  function clearClaim(hub) {
    const base = normalizeHubBase(hub || getHubBase());
    try {
      localStorage.removeItem(hubKey(base));
    } catch (_) { /* ignore */ }
    clearNativeClaim();
  }

  function isClaimed(hub) {
    const claim = loadClaim(hub);
    return Boolean(claim?.device_id && claim?.device_session);
  }

  /** Copy Android SharedPreferences claim into localStorage (survives WebView storage clears). */
  function hydrateNativeClaim(hub) {
    const native = readNativeClaim();
    if (!native?.device_session) return null;
    const base = normalizeHubBase(hub || native.hub_url || getHubBase());
    if (native.device_fingerprint) {
      try {
        localStorage.setItem(FINGERPRINT_KEY, native.device_fingerprint);
        memoryFingerprint = native.device_fingerprint;
      } catch (_) { /* ignore */ }
    }
    setHubBase(base);
    return saveClaim(base, {
      device_id: native.device_id,
      device_session: native.device_session,
      claim_code: native.claim_code,
    });
  }

  /**
   * Hub already claimed this fingerprint (e.g. ADB register) but TV lost session token.
   * Re-claim with the room code from device-status to obtain a fresh device_session.
   */
  async function syncSessionFromHub(hub) {
    const base = normalizeHubBase(hub || getHubBase());
    if (!base) return null;
    const existing = loadClaim(base);
    if (existing?.device_session) return existing;

    const fingerprint = getFingerprint();
    let status;
    try {
      const res = await fetch(
        `${base}/api/registry/device-status?fingerprint=${encodeURIComponent(fingerprint)}`,
        { headers: { "X-Device-Fingerprint": fingerprint } },
      );
      status = await res.json().catch(() => ({}));
      if (!res.ok || !status.claimed) return null;
    } catch (_) {
      return null;
    }

    const code = (status.claim_code || "").trim();
    if (code.length < 4) return null;

    try {
      const res = await fetch(`${base}/api/registry/claim-by-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Fingerprint": fingerprint,
        },
        body: JSON.stringify({
          claim_code: code,
          device_fingerprint: fingerprint,
          hub_url: base,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.device_session) return null;
      const roomConfig = data.room_config || status.room_config || {};
      return saveClaim(base, {
        device_id: data.device_id,
        device_session: data.device_session,
        claim_code: code.toUpperCase(),
        room_name: roomConfig.room_name || "",
        room_config: roomConfig,
        device_fingerprint: fingerprint,
      });
    } catch (_) {
      return null;
    }
  }

  // Hydrate on load when the APK already has a persisted claim.
  hydrateNativeClaim();

  global.AatomClaimStore = {
    DEFAULT_HUB_BASE,
    getHubBase,
    setHubBase,
    clearHubBase,
    normalizeHubBase,
    getFingerprint,
    loadClaim,
    saveClaim,
    clearClaim,
    isClaimed,
    hydrateNativeClaim,
    syncSessionFromHub,
    hubKey,
  };
})(typeof window !== "undefined" ? window : globalThis);
