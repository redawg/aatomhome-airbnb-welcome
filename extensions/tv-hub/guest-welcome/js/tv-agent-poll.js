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

  function launcher() {
    return global.GuestLauncher || global.GuestLauncherBridge || null;
  }

  function apiUrl(path) {
    const base = hubBase();
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function localIp() {
    const bridge = launcher();
    if (bridge?.getLocalIp) return bridge.getLocalIp() || null;
    return null;
  }

  async function pollOnce(deviceId, fingerprint) {
    const body = { device_fingerprint: fingerprint };
    const ip = localIp();
    if (ip) body.local_ip = ip;
    const res = await fetch(apiUrl(`/api/tv-agent/${deviceId}/poll`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`poll HTTP ${res.status}`);
    return res.json();
  }

  async function submitResult(deviceId, body) {
    const ip = localIp();
    if (ip && !body.local_ip) body.local_ip = ip;
    await fetch(apiUrl(`/api/tv-agent/${deviceId}/result`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function commandName(data) {
    if (!data) return null;
    const cmd = data.command;
    if (!cmd) return null;
    return typeof cmd === "string" ? cmd : cmd.command;
  }

  async function handleCommand(deviceId, data) {
    const name = commandName(data);
    if (!name) return;
    const bridge = launcher();

    if (name === "clear_streaming_logins" || name === "clear_streaming") {
      try {
        let cleared = [];
        if (bridge?.clearStreamingLogins) {
          const raw = bridge.clearStreamingLogins();
          try {
            cleared = JSON.parse(raw);
          } catch (_) {
            cleared = [];
          }
        }
        await submitResult(deviceId, {
          command: "clear_streaming_logins",
          ok: true,
          cleared,
        });
      } catch (err) {
        await submitResult(deviceId, {
          command: "clear_streaming_logins",
          ok: false,
          error: String(err),
        });
      }
      return;
    }

    if (name === "enable_adb") {
      try {
        const opened = bridge?.startAdbSetup?.() ?? false;
        await submitResult(deviceId, {
          command: "enable_adb",
          ok: opened,
          adb_setup_status: opened ? "wizard_opened" : "failed",
          adb_setup_message: opened
            ? "Opened ADB setup wizard"
            : "Could not open ADB setup — update the guest launcher app",
        });
      } catch (err) {
        await submitResult(deviceId, {
          command: "enable_adb",
          ok: false,
          adb_setup_status: "failed",
          adb_setup_message: String(err),
        });
      }
      return;
    }

    await submitResult(deviceId, { command: name, ok: true });
  }

  async function loop(deviceId, fingerprint) {
    while (activeDeviceId === deviceId) {
      try {
        const data = await pollOnce(deviceId, fingerprint);
        if (commandName(data)) await handleCommand(deviceId, data);
      } catch (_) {
        await sleep(5000);
      }
    }
  }

  function startTvAgentPoll(deviceId, fingerprint) {
    if (!deviceId) return;
    const fp = fingerprint || global.AatomClaimStore?.getFingerprint?.() || null;
    const bridge = launcher();
    if (bridge?.startTvAgent) bridge.startTvAgent();
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
