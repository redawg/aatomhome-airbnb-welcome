const focusables = [];
let focusIndex = 0;

function hubBase() {
  return AatomClaimStore.getHubBase();
}

function apiUrl(path) {
  const base = hubBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function setStatus(message, kind) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("onboard-status--error", "onboard-status--ok");
  if (kind) el.classList.add(`onboard-status--${kind}`);
}

function collectFocusables() {
  focusables.length = 0;
  document.querySelectorAll(".focusable").forEach((el) => {
    if (!el.hasAttribute("hidden") && el.offsetParent !== null) focusables.push(el);
  });
  focusIndex = Math.min(focusIndex, Math.max(0, focusables.length - 1));
  applyFocus();
}

function applyFocus() {
  focusables.forEach((el, i) => el.classList.toggle("focused", i === focusIndex));
  focusables[focusIndex]?.focus();
}

function moveFocus(delta) {
  if (!focusables.length) return;
  focusIndex = (focusIndex + delta + focusables.length) % focusables.length;
  applyFocus();
}

function readHubUrlInput() {
  const input = document.getElementById("hubUrl");
  const raw = (input?.value || "").trim();
  return AatomClaimStore.setHubBase(raw || AatomClaimStore.DEFAULT_HUB_BASE);
}

function toggleHubAdvanced(show) {
  const panel = document.getElementById("hubAdvanced");
  const toggle = document.getElementById("btnToggleHub");
  if (!panel) return;
  const open = show ?? panel.hasAttribute("hidden");
  if (open) {
    panel.removeAttribute("hidden");
    toggle?.setAttribute("aria-expanded", "true");
  } else {
    panel.setAttribute("hidden", "");
    toggle?.setAttribute("aria-expanded", "false");
  }
  collectFocusables();
}

async function verifyExistingClaim() {
  const hub = hubBase();
  const claim = AatomClaimStore.loadClaim(hub);
  if (!claim?.device_id || !claim?.device_session) return false;

  const fingerprint = AatomClaimStore.getFingerprint();
  try {
    const res = await fetch(apiUrl(`/api/registry/device-status?fingerprint=${encodeURIComponent(fingerprint)}`), {
      headers: { "X-Device-Fingerprint": fingerprint },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      AatomClaimStore.clearClaim(hub);
      setStatus("Session expired — enter your room code again.", "error");
      return false;
    }
    if (!data.claimed || data.device_id !== claim.device_id) {
      AatomClaimStore.clearClaim(hub);
      setStatus("Enter the room code from the hub.", null);
      return false;
    }
  } catch (_) {
    setStatus("Cannot reach hub — open Hub settings and check the address.", "error");
    toggleHubAdvanced(true);
    return false;
  }

  setStatus("Opening your room…", "ok");
  AatomTvAgent.startTvAgentPoll(claim.device_id, fingerprint);
  window.location.replace(`${hub}/guest/`);
  return true;
}

function clearLocalClaimForNewCode() {
  const hub = hubBase();
  AatomClaimStore.clearClaim(hub);
  const input = document.getElementById("roomCode");
  if (input) {
    input.value = "";
    input.focus();
  }
  setStatus("Enter a new room code from the hub.", null);
  collectFocusables();
}

function resetAll() {
  try {
    if (typeof GuestLauncher !== "undefined" && GuestLauncher.clearClaimState) {
      GuestLauncher.clearClaimState();
    }
  } catch (_) { /* ignore */ }
  AatomClaimStore.clearHubBase();
  const hubs = Object.keys(localStorage).filter((k) => k.startsWith("aatom_tv_claim_"));
  hubs.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch (_) { /* ignore */ }
  });
  try {
    localStorage.removeItem("aatom_tv_fingerprint");
  } catch (_) { /* ignore */ }
  const hubInput = document.getElementById("hubUrl");
  if (hubInput) hubInput.value = AatomClaimStore.DEFAULT_HUB_BASE;
  toggleHubAdvanced(true);
  clearLocalClaimForNewCode();
}

async function fetchWithTimeout(url, options, ms = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function claimWithCode(code) {
  const hub = readHubUrlInput();
  const fingerprint = AatomClaimStore.getFingerprint();
  const normalizedCode = String(code || "").trim().toUpperCase();
  setStatus("Connecting to hub…", null);

  let res;
  try {
    res = await fetchWithTimeout(apiUrl("/api/registry/claim-by-code"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Fingerprint": fingerprint,
      },
      body: JSON.stringify({
        claim_code: normalizedCode,
        device_fingerprint: fingerprint,
        hub_url: hub,
      }),
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Hub timed out — check Hub settings address and Wi‑Fi.");
    }
    throw new Error("Cannot reach hub — open Hub settings and confirm the address.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || `Invalid room code (${res.status})`);
  }

  const roomConfig = data.room_config || {};
  const roomName = roomConfig.room_name || "";
  AatomClaimStore.saveClaim(hub, {
    device_id: data.device_id,
    device_session: data.device_session,
    claim_code: normalizedCode,
    room_name: roomName,
    room_config: roomConfig,
    device_fingerprint: fingerprint,
  });

  setStatus(roomName ? `Connected — ${roomName}` : "Connected", "ok");
  AatomTvAgent.startTvAgentPoll(data.device_id, fingerprint);
  await new Promise((r) => setTimeout(r, 800));
  window.location.replace(`${hub}/guest/`);
}

async function onConnect() {
  const input = document.getElementById("roomCode");
  const code = (input?.value || "").trim().toUpperCase();
  if (input && code !== input.value) input.value = code;
  if (code.length < 4) {
    setStatus("Enter the 6-character room code.", "error");
    input?.focus();
    return;
  }
  try {
    await claimWithCode(code);
  } catch (err) {
    setStatus(err.message || "Could not connect — check the room code.", "error");
  }
}

function bindUi() {
  document.getElementById("btnConnect")?.addEventListener("click", onConnect);
  document.getElementById("btnNewCode")?.addEventListener("click", clearLocalClaimForNewCode);
  document.getElementById("btnToggleHub")?.addEventListener("click", () => {
    const panel = document.getElementById("hubAdvanced");
    toggleHubAdvanced(panel?.hasAttribute("hidden"));
  });
  document.getElementById("btnChangeHub")?.addEventListener("click", () => {
    const hubInput = document.getElementById("hubUrl");
    if (hubInput) {
      hubInput.value = AatomClaimStore.DEFAULT_HUB_BASE;
      hubInput.focus();
    }
    setStatus("Hub reset — confirm the address, then connect.", null);
    collectFocusables();
  });
  document.getElementById("roomCode")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onConnect();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      moveFocus(1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      moveFocus(-1);
      e.preventDefault();
    }
  }, true);

  collectFocusables();
  document.getElementById("roomCode")?.focus();
}

async function openGuestDashboard(claim) {
  const hub = hubBase();
  const fp = AatomClaimStore.getFingerprint();
  if (claim?.device_id) AatomTvAgent.startTvAgentPoll(claim.device_id, fp);
  window.location.replace(`${hub}/guest/`);
}

(async function init() {
  AatomClaimStore.hydrateNativeClaim?.();

  const hubInput = document.getElementById("hubUrl");
  if (hubInput) {
    hubInput.value = hubBase() || AatomClaimStore.DEFAULT_HUB_BASE;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("reprovision") === "1") {
    resetAll();
    return;
  }

  // Hub already claimed this TV — go straight to guest/HA (no room-code UI).
  const synced = await AatomClaimStore.syncSessionFromHub?.(hubBase());
  if (synced?.device_session) {
    await openGuestDashboard(synced);
    return;
  }
  if (await verifyExistingClaim()) return;

  bindUi();

  const autoCode = (params.get("code") || params.get("claim_code") || "").trim();
  if (autoCode.length >= 4) {
    const input = document.getElementById("roomCode");
    if (input) input.value = autoCode;
    try {
      await claimWithCode(autoCode);
    } catch (err) {
      setStatus(err.message || "Could not connect — check the room code.", "error");
    }
    return;
  }

  setStatus("Use the remote to type your code, then select Connect to room.", null);
})();
