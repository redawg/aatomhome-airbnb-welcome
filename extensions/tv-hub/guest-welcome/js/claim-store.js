/**
 * TV ↔ hub claim state (localStorage). Survives app restarts until cleared.
 */
(function (global) {
  const FINGERPRINT_KEY = "aatom_tv_fingerprint";

  function hubKey(hub) {
    const base = String(hub || "").replace(/\/$/, "");
    return `aatom_tv_claim_${base.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120)}`;
  }

  function getFingerprint() {
    try {
      let fp = localStorage.getItem(FINGERPRINT_KEY);
      if (!fp) {
        fp = `tv-${crypto.randomUUID()}`;
        localStorage.setItem(FINGERPRINT_KEY, fp);
      }
      return fp;
    } catch (_) {
      return `tv-${Date.now()}`;
    }
  }

  function loadClaim(hub) {
    try {
      const raw = localStorage.getItem(hubKey(hub));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.device_id) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function saveClaim(hub, payload) {
    const record = {
      device_id: payload.device_id,
      claim_code: payload.claim_code || null,
      room_name: payload.room_name || "",
      room_config: payload.room_config || null,
      claimed_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(hubKey(hub), JSON.stringify(record));
    } catch (_) { /* quota */ }
    return record;
  }

  function clearClaim(hub) {
    try {
      localStorage.removeItem(hubKey(hub));
    } catch (_) { /* ignore */ }
  }

  function isClaimed(hub) {
    return Boolean(loadClaim(hub)?.device_id);
  }

  global.AatomClaimStore = {
    getFingerprint,
    loadClaim,
    saveClaim,
    clearClaim,
    isClaimed,
    hubKey,
  };
})(typeof window !== "undefined" ? window : globalThis);
