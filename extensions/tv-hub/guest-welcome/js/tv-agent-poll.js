/**
 * Long-poll hub TV agent commands from the WebView (keeps agent_connected + HA sync alive).
 */
(function (global) {
  let pollTimer = null;
  let activeDeviceId = null;

  function hubBase() {
    if (global.HUB_BASE_URL) return String(global.HUB_BASE_URL).replace(/\/$/, "");
    if (global.location?.origin) return global.location.origin.replace(/\/$/, "");
    return "";
  }

  function apiUrl(path) {
    const base = hubBase();
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pollOnce(deviceId, fingerprint) {
    const res = await fetch(apiUrl(`/api/tv-agent/${deviceId}/poll`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_fingerprint: fingerprint }),
    });
    if (!res.ok) throw new Error(`poll HTTP ${res.status}`);
    return res.json();
  }

  async function submitResult(deviceId, body) {
    await fetch(apiUrl(`/api/tv-agent/${deviceId}/result`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function handleCommand(deviceId, command) {
    if (!command || !command.command) return;
    const name = command.command;
    if (name === "clear_streaming") {
      try {
        if (global.GuestLauncherBridge?.clearStreamingLogins) {
          global.GuestLauncherBridge.clearStreamingLogins();
        }
        await submitResult(deviceId, { command: name, ok: true, cleared: command.packages || [] });
      } catch (err) {
        await submitResult(deviceId, { command: name, ok: false, error: String(err) });
      }
      return;
    }
    await submitResult(deviceId, { command: name, ok: true });
  }

  async function loop(deviceId, fingerprint) {
    while (activeDeviceId === deviceId) {
      try {
        const data = await pollOnce(deviceId, fingerprint);
        if (data?.command) await handleCommand(deviceId, data.command);
      } catch (_) {
        await sleep(5000);
      }
    }
  }

  function startTvAgentPoll(deviceId, fingerprint) {
    if (!deviceId) return;
    const fp = fingerprint || global.AatomClaimStore?.getFingerprint?.() || null;
    stopTvAgentPoll();
    activeDeviceId = deviceId;
    loop(deviceId, fp);
  }

  function stopTvAgentPoll() {
    activeDeviceId = null;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  global.AatomTvAgent = {
    startTvAgentPoll,
    stopTvAgentPoll,
    pollOnce,
  };
})(typeof window !== "undefined" ? window : globalThis);
