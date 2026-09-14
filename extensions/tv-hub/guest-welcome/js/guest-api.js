/**
 * Authenticated TV → hub API client. Uses device session from room-code claim.
 */
(function (global) {
  function hubBase() {
    if (global.AatomClaimStore?.getHubBase) return global.AatomClaimStore.getHubBase();
    if (global.HUB_BASE_URL) return String(global.HUB_BASE_URL).replace(/\/$/, "");
    const host = global.location?.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return global.location.origin.replace(/\/$/, "");
    }
    return global.AatomClaimStore?.DEFAULT_HUB_BASE || "";
  }

  function authHeaders() {
    const hub = hubBase();
    const claim = global.AatomClaimStore?.loadClaim(hub);
    const fp = global.AatomClaimStore?.getFingerprint();
    const headers = { Accept: "application/json" };
    if (fp) headers["X-Device-Fingerprint"] = fp;
    if (claim?.device_session) {
      headers.Authorization = `Bearer ${claim.device_session}`;
    }
    return headers;
  }

  function apiUrl(path) {
    return `${hubBase()}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async function fetchJson(path, options = {}) {
    const headers = { ...authHeaders(), ...(options.headers || {}) };
    const res = await fetch(apiUrl(path), {
      ...options,
      headers,
      cache: options.cache || "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.detail || data.message || res.statusText || "Request failed";
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  async function postJson(path, body) {
    return fetchJson(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  global.AatomGuestApi = {
    hubBase,
    apiUrl,
    authHeaders,
    fetchJson,
    postJson,
  };
})(typeof window !== "undefined" ? window : globalThis);
