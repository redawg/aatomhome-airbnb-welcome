const focusables = [];
let focusIndex = 0;

function hubBase() {
  if (window.HUB_BASE_URL) return String(window.HUB_BASE_URL).replace(/\/$/, "");
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}

function apiUrl(path) {
  return `${hubBase()}${path.startsWith("/") ? path : `/${path}`}`;
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

async function verifyExistingClaim() {
  const hub = hubBase();
  const claim = AatomClaimStore.loadClaim(hub);
  if (!claim?.device_id) return false;

  document.getElementById("deviceIdLabel").textContent = String(claim.device_id);
  setStatus("Already connected — opening welcome…", "ok");
  AatomTvAgent.startTvAgentPoll(claim.device_id, AatomClaimStore.getFingerprint());
  window.location.replace(`${hub}/guest/`);
  return true;
}

async function claimWithCode(code) {
  const hub = hubBase();
  const fingerprint = AatomClaimStore.getFingerprint();
  setStatus("Connecting to hub…", null);

  const res = await fetch(apiUrl("/api/registry/claim-by-code"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claim_code: code.trim(),
      device_fingerprint: fingerprint,
      hub_url: hub,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || `Claim failed (${res.status})`);
  }

  const roomConfig = data.room_config || {};
  const roomName = roomConfig.room_name || "";
  AatomClaimStore.saveClaim(hub, {
    device_id: data.device_id,
    claim_code: code.trim().toUpperCase(),
    room_name: roomName,
    room_config: roomConfig,
  });

  document.getElementById("deviceIdLabel").textContent = String(data.device_id);
  setStatus(
    roomName
      ? `Connected — ${roomName}. Syncing controls…`
      : "Connected — syncing room & controls…",
    "ok",
  );

  AatomTvAgent.startTvAgentPoll(data.device_id, fingerprint);
  await new Promise((r) => setTimeout(r, 1200));
  window.location.replace(`${hub}/guest/`);
}

async function selfRegister() {
  const hub = hubBase();
  const fingerprint = AatomClaimStore.getFingerprint();
  setStatus("Registering TV with hub…", null);

  const res = await fetch(apiUrl("/api/registry/self-register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: fingerprint,
      name: "Guest TV",
      port: 5555,
      device_fingerprint: fingerprint,
      property_id: 1,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || `Register failed (${res.status})`);
  }

  if (data.status === "already_registered" && data.claim_code) {
    setStatus(`TV already registered — enter room code ${data.claim_code}`, null);
    const input = document.getElementById("roomCode");
    if (input) input.value = data.claim_code;
    return;
  }

  const code = data.claim_code || "";
  setStatus(
    code
      ? `Pending approval on hub — your room code is ${code}. Enter it above after staff approves.`
      : "Registered — approve this TV on the hub setup screen, then enter the room code.",
    null,
  );
  if (code) {
    const input = document.getElementById("roomCode");
    if (input) input.value = code;
  }
}

async function onConnect() {
  const input = document.getElementById("roomCode");
  const code = (input?.value || "").trim();
  if (code.length < 4) {
    setStatus("Enter the room code from the hub setup screen.", "error");
    return;
  }
  try {
    await claimWithCode(code);
  } catch (err) {
    setStatus(err.message || "Could not connect — check the room code.", "error");
  }
}

function bindUi() {
  document.getElementById("hubUrlLabel").textContent = hubBase() || "—";
  document.getElementById("btnConnect")?.addEventListener("click", onConnect);
  document.getElementById("btnSelfRegister")?.addEventListener("click", () => {
    selfRegister().catch((err) => setStatus(err.message, "error"));
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
}

(async function init() {
  bindUi();
  if (await verifyExistingClaim()) return;
  setStatus("Waiting for room code…", null);
})();
