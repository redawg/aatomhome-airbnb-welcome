const API = "/api";
const API_TIMEOUT_MS = 30000;
const API_LONG_TIMEOUT_MS = 120000;
const API_MIRROR_TIMEOUT_MS = 300000;
let selectedDevice = null;
let registry = [];
let activeHubView = "setup";
let connectAllInProgress = false;
let setupSelectedDeviceId = null;
let activePropertyId = 1;
let hubProperties = [];

function withPropertyId(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}property_id=${activePropertyId}`;
}

function activeGuestAccountEmail() {
  const prop = hubProperties.find(p => p.id === activePropertyId);
  return prop?.guest_google_account || "guest@example.com";
}

function activePropertyName() {
  const prop = hubProperties.find(p => p.id === activePropertyId);
  return prop?.name || `Property ${activePropertyId}`;
}

const KEYCODES = {
  "Home": 3, "Back": 4, "Up": 19, "Down": 20, "Left": 21, "Right": 22,
  "OK": 23, "Vol+": 24, "Vol-": 25, "Power": 26, "Menu": 82,
  "Play": 126, "Pause": 127, "Stop": 86, "Rewind": 89, "FastFwd": 90,
  "Ch+": 166, "Ch-": 167, "Guide": 172, "Info": 165, "Search": 84, "Settings": 176,
};

function formatApiError(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map(item => {
      if (typeof item === "string") return item;
      if (item?.msg) return item.msg;
      return JSON.stringify(item);
    }).join("; ");
  }
  if (typeof detail === "object") return detail.message || detail.msg || JSON.stringify(detail);
  return String(detail);
}

async function api(path, opts = {}) {
  const timeout = opts.timeout ?? API_TIMEOUT_MS;
  const { timeout: _timeout, ...fetchOpts } = opts;
  if (fetchOpts.body && typeof fetchOpts.body === "object" && !(fetchOpts.body instanceof FormData)) {
    fetchOpts.body = JSON.stringify(fetchOpts.body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json", ...fetchOpts.headers },
      signal: controller.signal,
      ...fetchOpts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(formatApiError(err.detail) || res.statusText);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out — TV may be slow or disconnected");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function isDeviceOnline(d = selectedDevice) {
  return d?.connection_state === "device";
}

function deviceConnectionBlockedMessage() {
  if (!selectedDevice) return "Select a TV in the sidebar first";
  if (selectedDevice.connection_state === "unauthorized") {
    return "ADB is blocked — on the TV open Wireless debugging and tap Allow, or click Pair with a fresh 6-digit code";
  }
  if (!isDeviceOnline()) return "TV not connected — use Connect all TVs or Connect";
  return null;
}

function connectionBannerHtml(online, state) {
  if (online) {
    return '<span class="status-dot" style="background:var(--success)"></span> ADB connected — actions are available';
  }
  if (state === "unauthorized") {
    return '<span class="status-dot" style="background:var(--warning)"></span> Needs pairing — open Wireless debugging on the TV and click Pair with a fresh code';
  }
  return '<span class="status-dot" style="background:var(--danger)"></span> Not connected — hub auto-connects on load, or click Connect all TVs';
}

function updateConnectionUi() {
  if (!selectedDevice) return;
  const online = isDeviceOnline();
  const state = selectedDevice.connection_state || "offline";
  const cls = `connection-banner ${online ? "online" : state}`;
  const html = connectionBannerHtml(online, state);
  const deviceBanner = document.getElementById("connectionBanner");
  const guestBanner = document.getElementById("guestConnectionBanner");
  if (deviceBanner && activeHubView !== "guest") {
    deviceBanner.className = cls;
    deviceBanner.innerHTML = html;
  }
  if (guestBanner) {
    guestBanner.style.display = activeHubView === "guest" ? "block" : "none";
    if (activeHubView === "guest") {
      guestBanner.className = cls;
      guestBanner.innerHTML = html;
    }
  }
  ["btnClearStreamingLogins"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !online;
  });
  const serialEl = document.getElementById("panelSerial");
  if (serialEl) {
    serialEl.textContent = `${selectedDevice.host}:${selectedDevice.port} — ${state}`;
  }
}

const HUB_LOG_STORAGE_KEY = "adbTvHubActivityLog";
const HUB_LOG_MAX_ENTRIES = 300;
const HUB_LOG_UI_KEY = "adbTvHubActivityLogUi";

let hubLogEntries = [];
let activityLogExpanded = true;
let activityLogFilterLevel = "all";
let activityLogFilterCategory = "all";
let activityLogFilterDevice = "all";

function loadHubLogState() {
  try {
    const raw = sessionStorage.getItem(HUB_LOG_STORAGE_KEY);
    hubLogEntries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(hubLogEntries)) hubLogEntries = [];
  } catch {
    hubLogEntries = [];
  }
  try {
    const ui = JSON.parse(sessionStorage.getItem(HUB_LOG_UI_KEY) || "{}");
    activityLogExpanded = ui.expanded !== false;
    activityLogFilterLevel = ui.filterLevel || "all";
    activityLogFilterCategory = ui.filterCategory || "all";
    activityLogFilterDevice = ui.filterDevice || "all";
  } catch {
    activityLogExpanded = true;
    activityLogFilterLevel = "all";
    activityLogFilterCategory = "all";
    activityLogFilterDevice = "all";
  }
}

function saveHubLogState() {
  try {
    sessionStorage.setItem(HUB_LOG_STORAGE_KEY, JSON.stringify(hubLogEntries.slice(-HUB_LOG_MAX_ENTRIES)));
    sessionStorage.setItem(HUB_LOG_UI_KEY, JSON.stringify({
      expanded: activityLogExpanded,
      filterLevel: activityLogFilterLevel,
      filterCategory: activityLogFilterCategory,
      filterDevice: activityLogFilterDevice,
    }));
  } catch { /* ignore quota errors */ }
}

function formatHubLogTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function hubLog({
  level = "info",
  category = "system",
  message,
  deviceName = null,
  deviceId = null,
  details = null,
  title = null,
} = {}) {
  if (!message) return;
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    level,
    category,
    message: String(message),
    deviceName,
    deviceId,
    details,
    title,
  };
  hubLogEntries.push(entry);
  if (hubLogEntries.length > HUB_LOG_MAX_ENTRIES) {
    hubLogEntries = hubLogEntries.slice(-HUB_LOG_MAX_ENTRIES);
  }
  if (level === "error" || level === "warn") {
    activityLogExpanded = true;
  }
  saveHubLogState();
  renderActivityLog();
}

function stepLogLevel(step) {
  if (step?.skipped) return "warn";
  if (step?.ok === false) return "error";
  if (step?.ok === true) return "success";
  return "info";
}

function formatStepDetails(step) {
  const parts = [];
  if (step?.messages?.length) parts.push(...step.messages);
  if (step?.note) parts.push(step.note);
  if (step?.log?.length) {
    parts.push(...step.log.map(s => {
      const mark = s.ok ? "✓" : "✗";
      const phase = s.phase ? `${s.phase}: ` : "";
      return `${mark} ${phase}${s.message || ""}`;
    }));
  }
  return parts.length ? parts.join("\n") : null;
}

function formatStepLabel(step) {
  const name = step.phase || step.action || "step";
  const msg = step.message || (step.skipped ? "skipped" : step.ok ? "ok" : step.ok === false ? "failed" : "—");
  return `${name}: ${msg}`;
}

function hubLogSteps(steps, {
  action = "Setup",
  category = "setup",
  deviceName = null,
  deviceId = null,
  parentLabel = "",
} = {}) {
  for (const step of steps || []) {
    const prefix = parentLabel ? `${parentLabel} → ` : `${action}: `;
    hubLog({
      level: stepLogLevel(step),
      category,
      message: `${prefix}${formatStepLabel(step)}`,
      deviceName: step.device_name || deviceName,
      deviceId: step.device_id ?? deviceId,
      details: formatStepDetails(step),
    });
    if (step.steps?.length) {
      hubLogSteps(step.steps, {
        action,
        category,
        deviceName: step.device_name || deviceName,
        deviceId: step.device_id ?? deviceId,
        parentLabel: step.phase || step.action || parentLabel,
      });
    }
    if (step.results?.length) {
      for (const result of step.results) {
        if (result.steps?.length) {
          hubLogSteps(result.steps, {
            action: `${action} → ${result.label || result.package || "app"}`,
            category,
            deviceName: step.device_name || deviceName,
            deviceId: step.device_id ?? deviceId,
          });
        } else if (result.log || result.package) {
          hubLogInstallResult(result, action, step.device_name || deviceName, step.device_id ?? deviceId);
        } else {
          hubLog({
            level: stepLogLevel(result),
            category,
            message: `${action}: ${result.message || result.note || result.label || "step"}`,
            deviceName: step.device_name || deviceName,
            deviceId: step.device_id ?? deviceId,
          });
        }
      }
    }
    if (step.install_report) {
      hubLogFromInstallReport(step.install_report, action, step.device_name || deviceName, step.device_id ?? deviceId);
    }
  }
}

function hubLogPhases(phases, {
  action = "Setup",
  category = "setup",
  deviceName = null,
  deviceId = null,
} = {}) {
  if (!phases?.length) return;
  hubLog({
    level: "info",
    category,
    message: `${action} — ${phases.length} phase(s)`,
    deviceName,
    deviceId,
  });
  for (const phase of phases) {
    hubLog({
      level: stepLogLevel(phase),
      category,
      message: `${action}: ${formatStepLabel(phase)}`,
      deviceName,
      deviceId,
      details: formatStepDetails(phase),
    });
    if (phase.steps?.length) {
      hubLogSteps(phase.steps, {
        action,
        category,
        deviceName,
        deviceId,
        parentLabel: phase.phase || phase.action,
      });
    }
  }
}

function hubLogInstallResult(entry, title, deviceName = null, deviceId = null) {
  if (!entry) return;
  const stepLines = (entry.log || []).map(step => {
    const mark = step.ok ? "✓" : "✗";
    const phase = step.phase ? `${step.phase}: ` : "";
    return `${mark} ${phase}${step.message || ""}`;
  });
  const detailParts = [];
  if (entry.message) detailParts.push(entry.message);
  if (entry.method) detailParts.push(`Method: ${installMethodLabel(entry.method)}`);
  if (entry.needs_play_store) detailParts.push("Install on source TV via Play Store, then retry.");
  if (stepLines.length) detailParts.push(stepLines.join("\n"));
  const status = entry.skipped ? "skipped" : (entry.ok ? "installed" : "failed");
  hubLog({
    level: entry.skipped ? "warn" : (entry.ok ? "success" : "error"),
    category: "install",
    message: `${entry.label || entry.package || "App"} — ${status}`,
    deviceName: entry.device_name || deviceName,
    deviceId,
    details: detailParts.join("\n") || null,
    title,
  });
}

function hubLogFromInstallReport(report, title = "Install", deviceName = null, deviceId = null) {
  if (!report?.entries?.length) return;
  const summary = report.failed
    ? `${report.succeeded || 0} ok, ${report.failed} failed${report.skipped ? `, ${report.skipped} skipped` : ""}`
    : `${report.succeeded || 0} ok${report.skipped ? `, ${report.skipped} skipped` : ""}`;
  const level = report.failed ? "error" : (report.skipped ? "warn" : "success");
  hubLog({
    level,
    category: "install",
    title,
    message: `${title}: ${summary}`,
    deviceName,
    deviceId,
  });

  for (const entry of report.entries) {
    hubLogInstallResult(entry, title, entry.device_name || deviceName, deviceId);
  }
}

function hubLogPackageOutcomeList(label, items, {
  deviceName = null,
  deviceId = null,
  category = "guest",
  level = "info",
} = {}) {
  for (const item of items || []) {
    const pkg = item.package || item.pkg || item.name;
    const msg = item.message || item.reason || item.error || (item.ok === false ? "failed" : "ok");
    hubLog({
      level: item.ok === false ? "error" : (item.skipped ? "warn" : level),
      category,
      message: pkg ? `${label}: ${pkg} — ${msg}` : `${label}: ${msg}`,
      deviceName: item.device_name || deviceName,
      deviceId: item.device_id ?? deviceId,
    });
  }
}

function hubLogOperationResponse(action, response, {
  deviceName = null,
  deviceId = null,
  category = null,
} = {}) {
  if (!response) return;
  const cat = category || "system";
  const name = response.device_name || deviceName;
  const id = response.device_id ?? deviceId;
  const hasFailures = Boolean(
    response.failed
    || (response.errors?.length)
    || (response.results || []).some(item => item.ok === false && !item.skipped),
  );
  const summaryLevel = response.ok === false ? "error" : (hasFailures ? "warn" : "success");
  const metaBits = [];
  if (response.operation_id) metaBits.push(`op ${response.operation_id}`);
  if (response.duration_ms != null) metaBits.push(`${response.duration_ms}ms`);
  const meta = metaBits.length ? metaBits.join(" · ") : null;

  if (response.message || response.ok !== undefined) {
    hubLog({
      level: summaryLevel,
      category: cat,
      message: response.message || `${action} complete`,
      deviceName: name,
      deviceId: id,
      details: [meta, response.note].filter(Boolean).join(" — ") || null,
    });
  }
  if (response.messages?.length) {
    hubLog({
      level: summaryLevel,
      category: cat,
      message: `${action} — step log`,
      deviceName: name,
      deviceId: id,
      details: response.messages.join("\n"),
    });
  }

  if (response.phases?.length) {
    hubLogPhases(response.phases, { action, category: cat, deviceName: name, deviceId: id });
  }
  if (response.steps?.length) {
    hubLogSteps(response.steps, { action, category: cat, deviceName: name, deviceId: id });
  }
  if (response.install_report) {
    hubLogFromInstallReport(response.install_report, action, name, id);
  }
  if (response.wake_steps?.length) {
    hubLogSteps(response.wake_steps, { action: `${action} wake`, category: "power", deviceName: name, deviceId: id });
  }
  if (response.standby_steps?.length) {
    hubLogSteps(response.standby_steps, { action: `${action} standby`, category: "setup", deviceName: name, deviceId: id });
  }
  if (response.cascade_results?.length) {
    for (const item of response.cascade_results) {
      hubLogOperationResponse(`${action} → ${item.device_name || "TV"}`, item, { category: cat });
    }
  }
  if (response.cleared?.length) {
    hubLogPackageOutcomeList(`${action} cleared`, response.cleared, {
      deviceName: name,
      deviceId: id,
      category: cat,
      level: "success",
    });
  }
  if (response.errors?.length) {
    hubLogPackageOutcomeList(`${action} error`, response.errors, {
      deviceName: name,
      deviceId: id,
      category: cat,
      level: "error",
    });
  }
  if (response.skipped?.length) {
    hubLogPackageOutcomeList(`${action} skipped`, response.skipped, {
      deviceName: name,
      deviceId: id,
      category: cat,
      level: "warn",
    });
  }
  if (response.results?.length && !response.install_report) {
    for (const item of response.results) {
      if (item.phases?.length || item.steps?.length || item.install_report || item.messages?.length
        || item.cleared?.length || item.errors?.length || item.skipped?.length) {
        hubLogOperationResponse(`${action} → ${item.device_name || "TV"}`, item, { category: cat });
      } else {
        hubLog({
          level: stepLogLevel(item),
          category: cat,
          message: item.message || `${action}: ${item.device_name || "TV"}`,
          deviceName: item.device_name || name,
          deviceId: item.device_id ?? id,
        });
      }
    }
  }
}

function hubLogPowerAction(action, device, { mode = "", requested = true, response = null } = {}) {
  const deviceName = device?.name || null;
  const deviceId = device?.id ?? null;
  const modeLabel = mode ? ` (${mode})` : "";
  if (requested) {
    hubLog({
      level: "info",
      category: "power",
      message: `${action}${modeLabel} requested`,
      deviceName,
      deviceId,
    });
  }
  if (response) {
    hubLog({
      level: response.ok ? "success" : "error",
      category: "power",
      message: response.message || `${action}${modeLabel} ${response.ok ? "sent" : "failed"}`,
      deviceName: response.device_name || deviceName,
      deviceId: response.device_id ?? deviceId,
      details: response.steps?.length
        ? response.steps.map(s => `${s.action || "step"}: ${s.message || (s.ok ? "ok" : "failed")}`).join("\n")
        : null,
    });
  }
}

function hubLogResultList(action, results, category = "guest") {
  for (const item of results || []) {
    if (item.ok) continue;
    hubLog({
      level: item.skipped ? "warn" : "error",
      category,
      message: item.message || `${item.device_name || "TV"}: ${action} failed`,
      deviceName: item.device_name || null,
      deviceId: item.device_id ?? null,
    });
  }
}

function hubLogApiResult(action, response, opts = {}) {
  hubLogOperationResponse(action, response, { ...opts, category: opts.category || "install" });
}

function activityLogCounts() {
  const errors = hubLogEntries.filter(e => e.level === "error").length;
  const warns = hubLogEntries.filter(e => e.level === "warn").length;
  return { errors, warns, total: hubLogEntries.length };
}

function filteredHubLogEntries() {
  return hubLogEntries.filter(entry => {
    if (activityLogFilterLevel === "problems" && entry.level !== "error" && entry.level !== "warn") {
      return false;
    }
    if (activityLogFilterCategory !== "all" && entry.category !== activityLogFilterCategory) {
      return false;
    }
    if (activityLogFilterDevice === "selected") {
      if (!selectedDevice) return false;
      if (entry.deviceId != null && entry.deviceId !== selectedDevice.id) return false;
      if (entry.deviceId == null && entry.deviceName && entry.deviceName !== selectedDevice.name) return false;
    }
    return true;
  });
}

function setActivityLogExpanded(expanded) {
  activityLogExpanded = expanded;
  const dock = document.getElementById("activityLogDock");
  document.body.classList.toggle("activity-log-open", expanded);
  dock?.classList.toggle("collapsed", !expanded);
  saveHubLogState();
}

function renderActivityLog() {
  const body = document.getElementById("activityLogBody");
  const countsEl = document.getElementById("activityLogCounts");
  if (!body) return;

  const { errors, warns, total } = activityLogCounts();
  if (countsEl) {
    const parts = [];
    if (errors) parts.push(`<span class="activity-log-count-error">${errors} error${errors === 1 ? "" : "s"}</span>`);
    if (warns) parts.push(`${warns} warn${warns === 1 ? "" : "s"}`);
    if (!parts.length) parts.push(`${total} entr${total === 1 ? "y" : "ies"}`);
    countsEl.innerHTML = parts.join(" · ");
  }

  const entries = filteredHubLogEntries();
  if (!entries.length) {
    body.innerHTML = '<p class="activity-log-empty">No log entries match the current filters.</p>';
    return;
  }

  body.innerHTML = entries.map(entry => {
    const details = entry.details
      ? `<div class="activity-log-details">${esc(entry.details).replace(/\n/g, "<br>")}</div>`
      : "";
    const device = entry.deviceName
      ? `<span class="activity-log-device">${esc(entry.deviceName)}</span>`
      : `<span class="activity-log-device">—</span>`;
    return `<div class="activity-log-line level-${esc(entry.level)}">
      <span class="activity-log-time">${esc(formatHubLogTime(entry.ts))}</span>
      <div class="activity-log-meta">${device}<span class="activity-log-category">${esc(entry.category)}</span></div>
      <div class="activity-log-message">${esc(entry.message)}${details}</div>
    </div>`;
  }).join("");

  body.scrollTop = body.scrollHeight;
}

function initActivityLog() {
  loadHubLogState();
  const dock = document.getElementById("activityLogDock");
  const levelSel = document.getElementById("activityLogFilterLevel");
  const categorySel = document.getElementById("activityLogFilterCategory");
  const deviceSel = document.getElementById("activityLogFilterDevice");
  if (levelSel) levelSel.value = activityLogFilterLevel;
  if (categorySel) categorySel.value = activityLogFilterCategory;
  if (deviceSel) deviceSel.value = activityLogFilterDevice;
  setActivityLogExpanded(activityLogExpanded);

  document.getElementById("btnActivityLogToggle")?.addEventListener("click", () => {
    setActivityLogExpanded(!activityLogExpanded);
  });
  levelSel?.addEventListener("change", () => {
    activityLogFilterLevel = levelSel.value;
    saveHubLogState();
    renderActivityLog();
  });
  categorySel?.addEventListener("change", () => {
    activityLogFilterCategory = categorySel.value;
    saveHubLogState();
    renderActivityLog();
  });
  deviceSel?.addEventListener("change", () => {
    activityLogFilterDevice = deviceSel.value;
    saveHubLogState();
    renderActivityLog();
  });
  document.getElementById("btnActivityLogClear")?.addEventListener("click", () => {
    if (!hubLogEntries.length || confirm("Clear all activity log entries?")) {
      hubLogEntries = [];
      saveHubLogState();
      renderActivityLog();
    }
  });
  document.getElementById("btnActivityLogCopy")?.addEventListener("click", () => {
    const text = filteredHubLogEntries().map(entry => {
      const device = entry.deviceName ? ` [${entry.deviceName}]` : "";
      const details = entry.details ? `\n  ${entry.details.replace(/\n/g, "\n  ")}` : "";
      return `${formatHubLogTime(entry.ts)} ${entry.level.toUpperCase()}${device} ${entry.message}${details}`;
    }).join("\n");
    navigator.clipboard?.writeText(text || "").then(() => {
      toast(text ? "Log copied" : "Nothing to copy", text ? "success" : "error");
    }).catch(() => toast("Could not copy log", "error"));
  });

  renderActivityLog();
}

function toast(msg, type = "success") {
  if (type === "error") {
    hubLog({
      level: "error",
      category: "system",
      message: msg,
      deviceName: selectedDevice?.name || null,
      deviceId: selectedDevice?.id ?? null,
    });
  } else if (type === "warning") {
    hubLog({
      level: "warn",
      category: "system",
      message: msg,
      deviceName: selectedDevice?.name || null,
      deviceId: selectedDevice?.id ?? null,
    });
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function serial() {
  return selectedDevice ? `${selectedDevice.host}:${selectedDevice.port}` : null;
}

function enc(s) { return encodeURIComponent(s); }

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function stateBadge(state) {
  const cls = state === "device" ? "online" : state === "unauthorized" ? "offline" : state === "offline" ? "offline" : "unknown";
  const label = state === "device" ? "Online" : state === "unauthorized" ? "Needs pairing" : state === "offline" ? "Offline" : state;
  return `<span class="badge ${cls}">${label}</span>`;
}

function dashboardTypeLabel(device) {
  if (device?.dashboard_type) return device.dashboard_type;
  const mode = device?.dashboard_mode || "cdo_str";
  return mode === "ha_dashboard" ? "HA" : "STR";
}

function deviceAdbOnline(device) {
  if (typeof device?.adb_online === "boolean") return device.adb_online;
  return device?.connection_state === "device";
}

function deviceAppConnected(device) {
  return Boolean(device?.agent_connected);
}

function canRequestRemoteAdb(device) {
  if (!device) return false;
  if (deviceAdbOnline(device)) return false;
  return deviceAppConnected(device);
}

async function requestRemoteAdbEnable(deviceId) {
  const res = await api(`/registry/${deviceId}/request-adb-enable`, { method: "POST" });
  toast(res.message || "ADB setup sent to TV — follow prompts on screen", "success");
  await loadRegistry();
  return res;
}

function roomStatusPills(device, { compact = false } = {}) {
  const adbOn = deviceAdbOnline(device);
  const appOn = Boolean(device?.agent_connected);
  const dash = dashboardTypeLabel(device);
  const compactCls = compact ? " room-status-pills--compact" : "";
  return `<div class="room-status-pills${compactCls}" aria-label="Room status">
    <span class="room-status-pill room-status-pill--adb ${adbOn ? "on" : "off"}" title="ADB ${adbOn ? "connected" : "offline"}">
      <span class="room-status-pill-dot" aria-hidden="true"></span>ADB
    </span>
    <span class="room-status-pill room-status-pill--app ${appOn ? "on" : "off"}" title="Guest app ${appOn ? "connected" : "offline"}">
      <span class="room-status-pill-dot" aria-hidden="true"></span>App
    </span>
    <span class="room-status-pill room-status-pill--dash dash-${esc(dash.toLowerCase())}" title="Dashboard type">${esc(dash)}</span>
  </div>`;
}

function roomCardHtml(device, { active = false, tag = "div", attrs = "" } = {}) {
  const name = esc(device.room_name || device.name || `Room ${device.id}`);
  const host = device.host && device.host !== "0.0.0.0"
    ? `${esc(device.host)}:${device.port || 5555}`
    : "awaiting claim";
  const activeCls = active ? " active" : "";
  const typeBadge = device.device_profile || device.device_type ? deviceTypeBadge(device) : "";
  return `<${tag} class="device-card room-status-card${activeCls}" data-id="${device.id}"${attrs}>
    <div class="device-card-top">
      <div class="name">${name}${device.is_streaming_source ? ' <span class="source-badge">Source</span>' : ""}</div>
      <div class="meta">${host}</div>
    </div>
    <div class="device-card-footer">
      ${typeBadge}
      ${roomStatusPills(device)}
    </div>
  </${tag}>`;
}

function deviceProfile(device) {
  return device?.device_profile || {};
}

function deviceCapabilities(device) {
  return deviceProfile(device).capabilities || {};
}

function deviceTypeLabel(device) {
  const profile = deviceProfile(device);
  if (profile.device_type_label) return profile.device_type_label;
  if (device?.device_type === "google_tv_streamer") return "Google TV Streamer";
  if (device?.device_type === "google_tv") return "Google TV";
  if (device?.device_type === "nvidia_shield") return "NVIDIA Shield";
  if (device?.device_type === "android_tv") return "Android TV";
  return "TV";
}

function deviceTypeBadge(device) {
  const type = deviceProfile(device).device_type || device?.device_type || "unknown";
  const label = deviceTypeLabel(device);
  return `<span class="device-type-badge type-${esc(type)}">${esc(label)}</span>`;
}

function updateTvActionsBar() {
  const bar = document.getElementById("tvActionsBar");
  if (!bar) return;
  bar.hidden = !selectedDevice;
}

function updateDeviceTypeUi() {
  const caps = deviceCapabilities(selectedDevice);
  const profile = deviceProfile(selectedDevice);
  const typeLabel = deviceTypeLabel(selectedDevice);

  const ensureBtn = document.getElementById("btnEnsureGuestReady");
  const restoreBtn = document.getElementById("btnGuestRestore");
  const appsOnlyBtn = document.getElementById("btnAppsOnlyMode");
  const typeBanner = document.getElementById("deviceTypeBanner");
  const panelType = document.getElementById("panelDeviceType");

  if (ensureBtn) {
    ensureBtn.style.display = selectedDevice ? "" : "none";
    ensureBtn.textContent = "Ensure TV ready";
    ensureBtn.title = caps.apps_only_mode
      ? "Persist dev options, sync launcher, enable apps-only mode"
      : "Persist dev options and sync guest launcher + streaming apps";
  }

  if (restoreBtn) {
    restoreBtn.style.display = selectedDevice ? "" : "none";
    if (caps.restore_google_tv) {
      restoreBtn.textContent = "Restore Google TV";
      restoreBtn.title = "Undo guest launcher — restore stock Google TV home";
    } else {
      restoreBtn.textContent = "Restore stock home";
      restoreBtn.title = "Undo guest launcher — restore the TV's stock home screen";
    }
  }

  if (appsOnlyBtn) {
    const showAppsOnly = selectedDevice && caps.apps_only_mode;
    appsOnlyBtn.style.display = showAppsOnly ? "" : "none";
    appsOnlyBtn.title = showAppsOnly
      ? "Enable Google TV Apps only mode via ADB (hides recommendations)"
      : "Apps only mode is available on Google TV";
  }

  const adbRemoteBtn = document.getElementById("btnRequestAdbEnable");
  if (adbRemoteBtn) {
    const show = canRequestRemoteAdb(selectedDevice);
    adbRemoteBtn.style.display = show ? "" : "none";
    const status = (selectedDevice?.adb_setup_status || "").trim();
    adbRemoteBtn.textContent = status === "requested" || status === "wizard_opened"
      ? "ADB setup in progress…"
      : "Enable ADB on TV";
    adbRemoteBtn.disabled = !show;
  }

  updateTvActionsBar();

  if (typeBanner) {
    if (!selectedDevice) {
      typeBanner.style.display = "none";
    } else {
      typeBanner.style.display = "block";
      const model = [profile.product_manufacturer, profile.product_model].filter(Boolean).join(" ");
      const notes = (profile.manual_notes || []).map(n => `<li>${esc(n)}</li>`).join("");
      typeBanner.innerHTML = `
        <div class="device-type-banner-head">
          ${deviceTypeBadge(selectedDevice)}
          ${model ? `<span class="device-type-model">${esc(model)}</span>` : ""}
        </div>
        <p class="device-type-goal">${esc(profile.unified_goal || "Same guest welcome and streaming apps on every TV.")}</p>
        ${notes ? `<ul class="device-type-notes">${notes}</ul>` : ""}`;
    }
  }

  if (panelType) {
    if (!selectedDevice) {
      panelType.style.display = "none";
    } else {
      panelType.style.display = "block";
      panelType.innerHTML = `
        <div class="device-type-banner-head">
          ${deviceTypeBadge(selectedDevice)}
          <span class="device-type-model">${esc(typeLabel)} controls</span>
        </div>
        <p class="device-type-goal" style="margin-top:0.35rem;">${esc(profile.unified_goal || "")}</p>`;
    }
  }
}

async function loadHealth() {
  try {
    const h = await api("/health");
    document.getElementById("statusText").textContent = `${h.connected_devices} connected`;
    document.getElementById("statusDot").style.background = "var(--success)";
    if (h.adb_version) {
      document.getElementById("adbVersion").textContent = `ADB ${h.adb_version.version}`;
    }
  } catch {
    document.getElementById("statusText").textContent = "Server offline";
    document.getElementById("statusDot").style.background = "var(--danger)";
  }
}

async function loadRegistry() {
  registry = await api("/registry");
  const list = document.getElementById("deviceList");
  if (!registry.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem;">No TVs registered</p>';
    return;
  }
  list.innerHTML = registry.map(d =>
    roomCardHtml(d, { active: selectedDevice?.id === d.id, tag: "div" })
  ).join("");
  list.querySelectorAll(".device-card").forEach(c =>
    c.addEventListener("click", () => selectDevice(parseInt(c.dataset.id))));
}

async function connectAllTvs(options = {}) {
  const { silent = false } = options;
  if (connectAllInProgress) return null;
  connectAllInProgress = true;
  const statusEl = document.getElementById("statusText");
  const statusDot = document.getElementById("statusDot");
  if (statusEl) statusEl.textContent = "Connecting all TVs…";
  if (statusDot) statusDot.style.background = "var(--warning)";
  try {
    const r = await api("/registry/connect-all", {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    await loadRegistry();
    await loadHealth();
    if (selectedDevice) {
      const updated = registry.find(d => d.id === selectedDevice.id);
      if (updated) {
        selectedDevice = updated;
        updateConnectionUi();
      }
    }
    const connected = r.connected_count || 0;
    const failed = r.failed_count || 0;
    const already = r.already_connected_count || 0;
    if (!silent || connected > 0 || failed > 0) {
      const toastType = failed && !connected && !already ? "error" : (failed ? "error" : "success");
      toast(r.message || "Connect complete", toastType);
    }
    return r;
  } catch (e) {
    if (!silent) toast(e.message, "error");
    await loadHealth();
    return null;
  } finally {
    connectAllInProgress = false;
  }
}

function updateGuestExperienceTvBadge() {
  const badge = document.getElementById("guestExperienceTvBadge");
  if (!badge) return;
  if (!selectedDevice) {
    badge.textContent = "No TV selected";
    badge.className = "guest-experience-tv-badge muted";
    return;
  }
  const online = isDeviceOnline();
  badge.textContent = `${selectedDevice.name} — ${online ? "online" : selectedDevice.connection_state || "offline"}`;
  badge.className = `guest-experience-tv-badge ${online ? "online" : "offline"}`;
}

function initializeDevicePanel() {
  if (!selectedDevice) return;
  const emptyState = document.getElementById("emptyState");
  const devicePanel = document.getElementById("devicePanel");
  const panelTitle = document.getElementById("panelTitle");
  if (emptyState) emptyState.style.display = "none";
  if (devicePanel) devicePanel.style.display = "block";
  if (panelTitle) panelTitle.textContent = selectedDevice.name;
  updateConnectionUi();
  updateDeviceTypeUi();
  loadOverview();
  loadGuestSummary();
}

function setupChecklistIcon(status) {
  if (status === "ok") return "✓";
  if (status === "warn") return "!";
  return "○";
}

function setSetupHaBanner(ok, message) {
  const el = document.getElementById("setupHaStatus");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.className = "setup-status-banner";
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.className = `setup-status-banner ${ok ? "ok" : "err"}`;
}

function renderSetupProvisioningPaths(paths) {
  const appSteps = document.getElementById("setupPathAppSteps");
  const adbSteps = document.getElementById("setupPathAdbSteps");
  const appPath = paths.find(p => p.id === "app");
  const adbPath = paths.find(p => p.id === "adb");
  if (appSteps && appPath?.steps?.length) {
    appSteps.innerHTML = appPath.steps.map(s => `<li>${esc(s)}</li>`).join("");
  }
  if (adbSteps && adbPath?.steps?.length) {
    adbSteps.innerHTML = adbPath.steps.map(s => `<li>${esc(s)}</li>`).join("");
  }
}

function renderGuestSignInHints(info) {
  const email = info?.guest_google_account || activeGuestAccountEmail();
  const profile = info?.profile_short || "Main profile · Android user 0";
  const profileLabel = document.getElementById("guestAccountProfileLabel");
  if (profileLabel) profileLabel.textContent = profile;
  const signInStep = document.getElementById("guestProvisionSignInStep");
  if (signInStep) {
    signInStep.innerHTML = `TV <strong>main profile</strong>: sign in with <strong>${esc(email)}</strong> (${esc(profile)})`;
  }
  const path2 = document.getElementById("guestProvisionPath2Steps");
  if (path2?.children?.[0]) {
    path2.children[0].innerHTML = signInStep?.innerHTML || `TV main profile: sign in with ${esc(email)}`;
  }
}

function renderSetupGuestSignIn(info) {
  const panel = document.getElementById("setupGuestSignInPanel");
  if (!panel) return;
  const data = info || {
    guest_google_account: activeGuestAccountEmail(),
    profile_short: "Main profile · Android user 0",
    configured: Boolean(activeGuestAccountEmail()?.includes("@")),
    summary: "",
    steps: [],
  };
  panel.hidden = false;
  const emailEl = document.getElementById("setupGuestSignInEmail");
  if (emailEl) {
    emailEl.textContent = data.guest_google_account || "—";
    emailEl.classList.toggle("setup-guest-signin-missing", !data.configured);
  }
  const profileEl = document.getElementById("setupGuestSignInProfile");
  if (profileEl) profileEl.textContent = data.profile_short || data.profile_label || "Main profile · Android user 0";
  const summaryEl = document.getElementById("setupGuestSignInSummary");
  if (summaryEl) summaryEl.textContent = data.summary || "";
  const stepsEl = document.getElementById("setupGuestSignInSteps");
  if (stepsEl && data.steps?.length) {
    stepsEl.innerHTML = data.steps.map(s => `<li>${esc(s)}</li>`).join("");
  }
  const badge = document.getElementById("setupGuestSignInBadge");
  if (badge) {
    badge.textContent = data.configured ? "Account configured" : "Set account in Hub card";
    badge.classList.toggle("warn", !data.configured);
  }
  renderGuestSignInHints(data);
}

function renderSetupChecklist(items) {
  const list = document.getElementById("setupChecklist");
  if (!list) return;
  if (!items?.length) {
    list.innerHTML = '<li class="setup-checklist-item loading">No checklist data</li>';
    return;
  }
  const sectionByChecklist = {
    hub: "overview",
    tv_slot: "rooms",
    tv_claimed: "rooms",
    tv_online: "rooms",
    tv_pending: "rooms",
    ha_url: "ha",
    ha_token: "ha",
    ha_connect: "ha",
    ha_integration: "integration",
  };
  list.innerHTML = items.map(item => {
    const jump = sectionByChecklist[item.id];
    const jumpAttr = jump ? ` data-setup-jump="${jump}" role="button" tabindex="0"` : "";
    return `<li class="setup-checklist-item ${esc(item.status || "todo")}${jump ? " setup-checklist-jump" : ""}"${jumpAttr}>
      <span class="setup-checklist-icon" aria-hidden="true">${setupChecklistIcon(item.status)}</span>
      <div class="setup-checklist-body">
        <div class="setup-checklist-label">${esc(item.label)}</div>
        <div class="setup-checklist-detail">${esc(item.detail || "")}</div>
      </div>
    </li>`;
  }).join("");
  list.querySelectorAll("[data-setup-jump]").forEach(row => {
    const go = () => navigateSetup(row.dataset.setupJump);
    row.addEventListener("click", go);
    row.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
}

function setupRoomStatusLabel(device) {
  const reg = (device.registration_status || "active").toLowerCase();
  if (reg === "claimed") return { text: "Claimed", cls: "claimed" };
  if (reg === "unclaimed") return { text: "Awaiting TV", cls: "unclaimed" };
  if (device.connection_state === "device") return { text: "ADB online", cls: "active" };
  return { text: "Ready", cls: "active" };
}

function setupRoomTvSummary(device) {
  const status = setupRoomStatusLabel(device);
  const reg = (device.registration_status || "").toLowerCase();
  if (reg === "claimed" && device.host && device.host !== "0.0.0.0") {
    const name = device.name && device.name !== device.room_name ? device.name : "TV";
    const online = device.connection_state === "device" ? " · ADB online" : "";
    return `${name} · ${device.host}${online}`;
  }
  if (reg === "claimed") return "TV registered (awaiting IP)";
  if (device.provision_mode === "adb" && device.host && device.host !== "0.0.0.0") {
    return `${device.name || "TV"} · ${device.host}:${device.port || 5555}`;
  }
  return "No TV registered";
}

function renderSetupNavRooms(devices) {
  const list = document.getElementById("setupNavRoomList");
  if (!list) return;
  if (!devices.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = devices.map(d => {
    const name = esc(d.room_name || d.name || `Room ${d.id}`);
    const tv = esc(setupRoomTvSummary(d));
    const active = setupSelectedDeviceId === d.id && activeSetupSection === "rooms" ? " active" : "";
    return `<button type="button" class="main-nav-room-item${active}" data-setup-section="rooms" data-setup-device-id="${d.id}">
      <span class="main-nav-room-name">${name}</span>
      <span class="main-nav-room-tv">${tv}</span>
    </button>`;
  }).join("");
  list.querySelectorAll(".main-nav-room-item").forEach(btn => {
    btn.addEventListener("click", () => {
      navigateSetup("rooms", parseInt(btn.dataset.setupDeviceId, 10));
    });
  });
}

function renderSetupRoomSubnav(devices) {
  const nav = document.getElementById("setupRoomSubnav");
  const empty = document.getElementById("setupRoomSubnavEmpty");
  if (!nav) return;
  if (!devices.length) {
    nav.querySelectorAll(".setup-room-subnav-item").forEach(el => el.remove());
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  nav.querySelectorAll(".setup-room-subnav-item").forEach(el => el.remove());
  devices.forEach(d => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `setup-room-subnav-item${setupSelectedDeviceId === d.id ? " active" : ""}`;
    btn.dataset.setupDeviceId = String(d.id);
    const name = d.room_name || d.name || `Room ${d.id}`;
    const tv = setupRoomTvSummary(d);
    const hostLine = d.host && d.host !== "0.0.0.0"
      ? `${esc(d.host)}:${d.port || 5555}`
      : esc(tv);
    btn.innerHTML = `<span class="setup-room-subnav-name">${esc(name)}</span>
      <span class="setup-room-subnav-tv">${hostLine}</span>
      ${roomStatusPills(d, { compact: true })}`;
    btn.classList.add("room-status-card");
    btn.addEventListener("click", () => selectSetupDevice(d.id));
    nav.appendChild(btn);
  });
}

function syncSetupRoomExperienceForm() {
  const draft = setupRoomConfigDraft;
  const nameInput = document.getElementById("setupRoomDisplayName");
  const modeSelect = document.getElementById("setupRoomDashboardMode");
  const haUrlInput = document.getElementById("setupRoomHaDashboardUrl");
  const haUrlWrap = document.getElementById("setupRoomHaUrlWrap");
  if (!draft) return;
  if (nameInput) nameInput.value = draft.room_name || "";
  if (modeSelect) modeSelect.value = draft.dashboard_mode || "cdo_str";
  if (haUrlInput) haUrlInput.value = draft.ha_dashboard_url || "";
  if (haUrlWrap) haUrlWrap.hidden = (draft.dashboard_mode || "cdo_str") !== "ha_dashboard";
}

function renderSetupRoomControlsList() {
  const list = document.getElementById("setupRoomControlsList");
  const countEl = document.getElementById("setupRoomControlsCount");
  const controls = setupRoomConfigDraft?.controls || [];
  if (countEl) {
    countEl.textContent = controls.length
      ? `${controls.length} assigned`
      : "0 assigned";
  }
  if (!list) return;
  if (!controls.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = controls.map((ctrl, idx) => {
    const label = ctrl.label || ctrl.entity_id || "Device";
    const entity = ctrl.entity_id || "";
    return `<li class="setup-room-control-item">
      <div>
        <div class="setup-room-control-item-name">${esc(label)}</div>
        <div class="setup-room-control-item-meta">${esc(entity)}</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-remove-control="${idx}" aria-label="Remove ${esc(label)}">Remove</button>
    </li>`;
  }).join("");
  list.querySelectorAll("[data-remove-control]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.removeControl, 10);
      if (!setupRoomConfigDraft?.controls?.[i]) return;
      setupRoomConfigDraft.controls.splice(i, 1);
      renderSetupRoomControlsList();
      populateSetupRoomEntityPicker();
    });
  });
}

function populateSetupRoomEntityPicker() {
  const pick = document.getElementById("setupRoomEntityPick");
  if (!pick || !setupHaConnected) return;
  const assigned = new Set((setupRoomConfigDraft?.controls || []).map(c => c.entity_id));
  const entities = (setupHaEntitiesCache || []).filter(e => !assigned.has(e.entity_id));
  pick.innerHTML = `<option value="">Add device…</option>${entities.map(e => {
    const label = e.label || e.entity_id;
    const area = e.area ? ` · ${e.area}` : "";
    return `<option value="${esc(e.entity_id)}">${esc(label)}${esc(area)}</option>`;
  }).join("")}`;
}

function addSetupRoomControl(entityId, label) {
  const id = (entityId || "").trim();
  if (!id || !setupRoomConfigDraft) return false;
  if (!/^[a-z_]+\.[a-z0-9_.]+$/i.test(id)) {
    toast("Entity ID should look like light.living_room", "error");
    return false;
  }
  if ((setupRoomConfigDraft.controls || []).some(c => c.entity_id === id)) {
    toast("Already assigned to this room", "error");
    return false;
  }
  setupRoomConfigDraft.controls.push({
    entity_id: id,
    label: (label || id).trim(),
    type: "toggle",
  });
  renderSetupRoomControlsList();
  populateSetupRoomEntityPicker();
  return true;
}

function updateSetupRoomControlsUi() {
  const hint = document.getElementById("setupRoomControlsHint");
  const addRow = document.getElementById("setupRoomControlsAdd");
  const pick = document.getElementById("setupRoomEntityPick");
  if (setupHaConnected) {
    if (hint) hint.textContent = "Guests see these on the TV welcome screen. Pick from Home Assistant or add by entity ID.";
    if (addRow) addRow.hidden = false;
    populateSetupRoomEntityPicker();
  } else {
    if (hint) hint.textContent = "Home Assistant not connected — add entities by ID (e.g. light.living_room), or connect HA in Setup → Integration.";
    if (addRow) addRow.hidden = true;
    if (pick) pick.innerHTML = '<option value="">Connect HA to browse entities</option>';
  }
  renderSetupRoomControlsList();
}

async function ensureSetupHaEntities() {
  if (!setupHaConnected) return [];
  if (setupHaEntitiesCache) return setupHaEntitiesCache;
  try {
    const res = await api("/aatomhome/setup/homeassistant/entities");
    setupHaEntitiesCache = res.entities || [];
    return setupHaEntitiesCache;
  } catch (_) {
    setupHaEntitiesCache = [];
    return [];
  }
}

async function loadSetupRoomExperience(device) {
  const saveStatus = document.getElementById("setupRoomSaveStatus");
  if (!device) return;
  setupRoomExperienceDeviceId = device.id;
  if (saveStatus) saveStatus.textContent = "";
  try {
    const data = await api(`/registry/${device.id}/room-config`);
    const cfg = data.room_config || {};
    setupRoomConfigDraft = {
      room_name: cfg.room_name || device.room_name || device.name || "",
      dashboard_mode: cfg.dashboard_mode || "cdo_str",
      ha_dashboard_url: cfg.ha_dashboard_url || "",
      welcome_overrides: cfg.welcome_overrides || {},
      controls: (cfg.controls || []).map(c => ({
        entity_id: c.entity_id,
        label: c.label || c.entity_id,
        type: c.type || "toggle",
      })),
    };
    syncSetupRoomExperienceForm();
    await ensureSetupHaEntities();
    updateSetupRoomControlsUi();
  } catch (err) {
    setupRoomConfigDraft = {
      room_name: device.room_name || device.name || "",
      dashboard_mode: device.dashboard_mode || "cdo_str",
      ha_dashboard_url: "",
      welcome_overrides: {},
      controls: [],
    };
    syncSetupRoomExperienceForm();
    updateSetupRoomControlsUi();
    if (saveStatus) {
      saveStatus.textContent = err.message || "Could not load room settings";
      saveStatus.className = "setup-room-save-status err";
    }
  }
}

async function saveSetupRoomExperience() {
  const deviceId = setupRoomExperienceDeviceId;
  const saveStatus = document.getElementById("setupRoomSaveStatus");
  if (!deviceId || !setupRoomConfigDraft) return;
  const nameInput = document.getElementById("setupRoomDisplayName");
  const modeSelect = document.getElementById("setupRoomDashboardMode");
  const haUrlInput = document.getElementById("setupRoomHaDashboardUrl");
  setupRoomConfigDraft.room_name = nameInput?.value?.trim() || "";
  setupRoomConfigDraft.dashboard_mode = modeSelect?.value || "cdo_str";
  setupRoomConfigDraft.ha_dashboard_url = haUrlInput?.value?.trim() || "";
  if (saveStatus) {
    saveStatus.textContent = "Saving…";
    saveStatus.className = "setup-room-save-status";
  }
  try {
    await api(`/registry/${deviceId}/room-config`, {
      method: "PUT",
      body: {
        room_name: setupRoomConfigDraft.room_name,
        dashboard_mode: setupRoomConfigDraft.dashboard_mode,
        ha_dashboard_url: setupRoomConfigDraft.ha_dashboard_url,
        welcome_overrides: setupRoomConfigDraft.welcome_overrides,
        controls: setupRoomConfigDraft.controls,
      },
    });
    if (saveStatus) {
      saveStatus.textContent = "Saved";
      saveStatus.className = "setup-room-save-status ok";
    }
    toast("Room settings saved", "success");
    await loadSetupStatus();
    await loadRegistry();
    selectSetupDevice(deviceId);
  } catch (err) {
    if (saveStatus) {
      saveStatus.textContent = err.message || "Save failed";
      saveStatus.className = "setup-room-save-status err";
    }
    toast(err.message || "Could not save room settings", "error");
  }
}

function renderSetupRoomDetail(device) {
  const empty = document.getElementById("setupRoomDetailEmpty");
  const body = document.getElementById("setupRoomDetailBody");
  if (!device) {
    if (empty) empty.hidden = false;
    if (body) body.hidden = true;
    setupRoomExperienceDeviceId = null;
    setupRoomConfigDraft = null;
    return;
  }
  if (empty) empty.hidden = true;
  if (body) body.hidden = false;

  const status = setupRoomStatusLabel(device);
  const statusEl = document.getElementById("setupRoomDetailStatus");
  const codeEl = document.getElementById("setupRoomDetailCode");
  const tvEl = document.getElementById("setupRoomDetailTv");
  const modeEl = document.getElementById("setupRoomDetailMode");
  const openBtn = document.getElementById("btnSetupRoomOpenTv");

  if (statusEl) {
    statusEl.innerHTML = `${esc(status.text)} ${roomStatusPills(device, { compact: true })}`;
    statusEl.className = `setup-room-status setup-room-status--${status.cls}`;
  }
  if (codeEl) codeEl.textContent = device.claim_code || "—";
  if (tvEl) tvEl.textContent = setupRoomTvSummary(device);
  if (modeEl) {
    modeEl.textContent = device.provision_mode === "app"
      ? "Path 1 — download app + room code"
      : "Path 2 — ADB push from hub";
  }
  if (openBtn) {
    openBtn.disabled = false;
    openBtn.onclick = () => {
      selectDevice(device.id);
      showHubView("devices");
    };
  }
  const adbBtn = document.getElementById("btnSetupRoomEnableAdb");
  if (adbBtn) {
    const show = canRequestRemoteAdb(device);
    adbBtn.hidden = !show;
    adbBtn.disabled = !show;
    const status = (device.adb_setup_status || "").trim();
    adbBtn.textContent = status === "requested" || status === "wizard_opened"
      ? "ADB setup in progress…"
      : "Enable ADB on TV";
    adbBtn.onclick = async () => {
      try {
        await requestRemoteAdbEnable(device.id);
        await loadSetupStatus();
      } catch (err) {
        toast(err.message || "Could not request ADB setup", "error");
      }
    };
  }
  loadSetupRoomExperience(device);
}

function renderSetupRoomsUi(devices) {
  setupRoomsCache = devices || [];
  renderSetupNavRooms(setupRoomsCache);
  renderSetupRoomSubnav(setupRoomsCache);
  if (setupSelectedDeviceId) {
    const selected = setupRoomsCache.find(d => d.id === setupSelectedDeviceId);
    if (selected) renderSetupRoomDetail(selected);
    else if (setupRoomsCache.length) selectSetupDevice(setupRoomsCache[0].id);
    else renderSetupRoomDetail(null);
  } else if (setupRoomsCache.length && activeSetupSection === "rooms") {
    selectSetupDevice(setupRoomsCache[0].id);
  } else {
    renderSetupRoomDetail(null);
  }
}

async function regenerateRoomCode(deviceId) {
  try {
    const res = await api(`/registry/${deviceId}/regenerate-claim`, { method: "POST" });
    selectSetupDevice(deviceId);
    const panel = document.getElementById("setupRoomCodePanel");
    const codeEl = document.getElementById("setupRoomCodeValue");
    const devEl = document.getElementById("setupRoomCodeDevice");
    if (devEl) devEl.textContent = res.device_name || `Room #${deviceId}`;
    if (codeEl) codeEl.textContent = res.claim_code || "—";
    if (panel) panel.hidden = false;
    await loadRegistry();
    await loadSetupStatus();
    toast(res.message || "New room code ready", "success");
  } catch (err) {
    toast(err.message || "Could not issue new code", "error");
  }
}

function renderSetupTvList(tvs) {
  const reg = document.getElementById("setupTvRegistered");
  const claimed = document.getElementById("setupTvClaimed");
  const on = document.getElementById("setupTvOnline");
  const pend = document.getElementById("setupTvPending");
  const pendWrap = document.getElementById("setupTvPendingWrap");
  const list = document.getElementById("setupTvList");
  const pendingBox = document.getElementById("setupPendingList");
  if (reg) reg.textContent = String(tvs?.registered ?? 0);
  if (claimed) claimed.textContent = String(tvs?.claimed ?? 0);
  if (on) on.textContent = String(tvs?.online ?? 0);
  const pendingCount = tvs?.pending ?? 0;
  if (pend) pend.textContent = String(pendingCount);
  if (pendWrap) pendWrap.hidden = pendingCount === 0;

  const devices = tvs?.devices || [];
  renderSetupRoomsUi(devices);

  if (list) {
    if (!devices.length) {
      list.innerHTML = "";
    } else {
      list.innerHTML = devices.map(d => {
        const selected = setupSelectedDeviceId === d.id ? " active" : "";
        const mode = d.provision_mode === "app" ? "App" : "ADB";
        const hostLine = d.host === "0.0.0.0" ? "awaiting claim" : `${esc(d.host || "")}:${esc(String(d.port || 5555))}`;
        const claimedTag = d.registration_status === "claimed" ? " · claimed" : "";
        return `<li class="setup-tv-selectable room-status-card${selected}" data-setup-device-id="${d.id}" role="button" tabindex="0">
          <div class="setup-tv-selectable-body">
            <div class="setup-tv-name">${esc(d.room_name || d.name || "TV")} <span class="setup-tv-mode">${mode}${claimedTag}</span></div>
            <div class="setup-tv-host">${hostLine}</div>
            ${roomStatusPills(d, { compact: true })}
          </div>
        </li>`;
      }).join("");
      list.querySelectorAll("[data-setup-device-id]").forEach(row => {
        const pick = () => selectSetupDevice(parseInt(row.dataset.setupDeviceId, 10));
        row.addEventListener("click", pick);
        row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      });
    }
  }

  const roomBtn = document.getElementById("btnSetupRoomCode");
  if (roomBtn) roomBtn.disabled = !setupSelectedDeviceId;
  const selected = (tvs?.devices || []).find(d => d.id === setupSelectedDeviceId);
  const adbOnline = selected?.connection_state === "device";
  const pushBtn = document.getElementById("btnSetupPushWelcome");
  const apkBtn = document.getElementById("btnSetupUpdateApk");
  if (pushBtn) pushBtn.disabled = !adbOnline;
  if (apkBtn) apkBtn.disabled = !adbOnline;

  if (pendingBox) {
    const pending = tvs?.pending_devices || [];
    if (!pending.length) {
      pendingBox.hidden = true;
      pendingBox.innerHTML = "";
    } else {
      pendingBox.hidden = false;
      pendingBox.innerHTML = `<strong>Pending approval</strong>${pending.map(p => `
        <div class="setup-pending-item">
          <span>${esc(p.name || p.host)} <span style="color:var(--text-muted)">${esc(p.host || "")}</span></span>
          <button type="button" class="btn btn-primary btn-sm" data-approve-pending="${p.id}">Approve</button>
        </div>
      `).join("")}`;
      pendingBox.querySelectorAll("[data-approve-pending]").forEach(btn => {
        btn.addEventListener("click", async () => {
          try {
            await api(`/registry/pending/${btn.dataset.approvePending}/approve`, { method: "POST" });
            toast("TV approved", "success");
            await loadSetupStatus();
            await loadRegistry();
          } catch (err) {
            toast(err.message || "Approve failed", "error");
          }
        });
      });
    }
  }
}

function selectSetupDevice(deviceId) {
  setupSelectedDeviceId = deviceId;
  try {
    localStorage.setItem("aatom_setup_room_id", String(deviceId));
  } catch (_) { /* quota */ }
  document.querySelectorAll(".setup-tv-selectable").forEach(el => {
    el.classList.toggle("active", parseInt(el.dataset.setupDeviceId, 10) === deviceId);
  });
  document.querySelectorAll(".setup-room-subnav-item").forEach(el => {
    el.classList.toggle("active", parseInt(el.dataset.setupDeviceId, 10) === deviceId);
  });
  document.querySelectorAll(".main-nav-room-item").forEach(el => {
    el.classList.toggle("active", parseInt(el.dataset.setupDeviceId, 10) === deviceId);
  });
  const navCurrent = document.getElementById("setupNavCurrent");
  const selected = setupRoomsCache.find(d => d.id === deviceId)
    || (registry || []).find(d => d.id === deviceId);
  if (navCurrent && activeSetupSection === "rooms" && selected) {
    navCurrent.textContent = selected.room_name || selected.name || `Room ${deviceId}`;
  }
  renderSetupRoomDetail(selected || null);
  const roomBtn = document.getElementById("btnSetupRoomCode");
  if (roomBtn) roomBtn.disabled = !deviceId;
  const adbOnline = selected?.connection_state === "device";
  const pushBtn = document.getElementById("btnSetupPushWelcome");
  const apkBtn = document.getElementById("btnSetupUpdateApk");
  if (pushBtn) pushBtn.disabled = !adbOnline;
  if (apkBtn) apkBtn.disabled = !adbOnline;
  const panel = document.getElementById("setupRoomCodePanel");
  if (panel) panel.hidden = true;
}

function renderPropertySelectOptions(selectEl, properties, selectedId) {
  if (!selectEl) return;
  if (!properties.length) {
    selectEl.innerHTML = '<option value="1">Property 1</option>';
    return;
  }
  selectEl.innerHTML = properties.map(p => (
    `<option value="${p.id}"${p.id === selectedId ? " selected" : ""}>${esc(p.name)}</option>`
  )).join("");
}

function activePropertyLink() {
  const prop = hubProperties.find(p => p.id === activePropertyId);
  return prop?.property_link || "";
}

function activePropertyRecord() {
  return hubProperties.find(p => p.id === activePropertyId) || null;
}

let propertyCoordsManual = false;

function updateCoordsHint() {
  const hint = document.getElementById("setupCoordsHint");
  if (!hint) return;
  hint.textContent = propertyCoordsManual
    ? "Manual coordinates — edit lat/lon or change the address and save to re-geocode."
    : "Coordinates are filled from the property address. Edit lat/lon to override.";
}

function syncPropertyLocationFields({ force = false } = {}) {
  const prop = activePropertyRecord();
  if (!prop) return;
  propertyCoordsManual = Boolean(prop.weather_coords_manual);
  updateCoordsHint();
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!force && document.activeElement === el) return;
    el.value = val ?? "";
  };
  setVal("setupPropertyAddress", prop.property_address || "");
  setVal("setupWeatherLocation", prop.weather_location_name || "");
  setVal(
    "setupWeatherLat",
    prop.weather_lat != null && prop.weather_lat !== "" ? String(prop.weather_lat) : "",
  );
  setVal(
    "setupWeatherLon",
    prop.weather_lon != null && prop.weather_lon !== "" ? String(prop.weather_lon) : "",
  );
  setVal(
    "setupTempestStationId",
    prop.tempest_station_id != null && prop.tempest_station_id !== ""
      ? String(prop.tempest_station_id)
      : "",
  );
  const tokenHint = document.getElementById("setupTempestTokenHint");
  if (tokenHint) {
    if (prop.tempest_api_token_configured) {
      const src = prop.tempest_token_source === "env" ? "hub env" : "saved";
      tokenHint.textContent = `Token configured (${src}${prop.tempest_api_token_preview ? `: ${prop.tempest_api_token_preview}` : ""})`;
    } else {
      tokenHint.textContent = "No Tempest token saved yet";
    }
  }
  const status = document.getElementById("setupPropertyLocationStatus");
  if (status && force) {
    const parts = [];
    if (prop.property_address) parts.push("address");
    if (prop.weather_location_name || prop.weather_lat != null) parts.push("forecast area");
    if (prop.tempest_station_id) parts.push("Tempest station");
    if (prop.tempest_api_token_configured) parts.push("Tempest token");
    status.textContent = parts.length
      ? `Loaded: ${parts.join(", ")}`
      : "No address or weather saved yet for this property";
    status.className = "setup-room-save-status";
  }
}

function collectPropertyLocationForm() {
  const body = {
    property_address: document.getElementById("setupPropertyAddress")?.value?.trim() || "",
    weather_location_name: document.getElementById("setupWeatherLocation")?.value?.trim() || "",
    weather_lat: parseWeatherCoord(document.getElementById("setupWeatherLat")?.value),
    weather_lon: parseWeatherCoord(document.getElementById("setupWeatherLon")?.value),
    weather_coords_manual: propertyCoordsManual,
    tempest_station_id: parseTempestStationId(document.getElementById("setupTempestStationId")?.value),
  };
  const token = document.getElementById("setupTempestToken")?.value?.trim() || "";
  if (token) body.tempest_api_token = token;
  return body;
}

async function savePropertyLocation(body, { silent = false, successMsg = "Address & weather saved" } = {}) {
  const status = document.getElementById("setupPropertyLocationStatus");
  if (status) {
    status.textContent = "Saving…";
    status.className = "setup-room-save-status";
  }
  try {
    const res = await api(`/aatomhome/properties/${activePropertyId}/location`, {
      method: "PUT",
      body,
    });
    const idx = hubProperties.findIndex(p => p.id === activePropertyId);
    if (idx >= 0) {
      hubProperties[idx] = { ...hubProperties[idx], ...res };
    }
    const tokenInput = document.getElementById("setupTempestToken");
    if (tokenInput && body.tempest_api_token) tokenInput.value = "";
    syncPropertyLocationFields({ force: true });
    if (status) {
      status.textContent = "Saved";
      status.className = "setup-room-save-status ok";
    }
    if (!silent) toast(successMsg, "success");
    return true;
  } catch (err) {
    if (status) {
      status.textContent = err.message || "Save failed";
      status.className = "setup-room-save-status err";
    }
    toast(err.message || "Save failed", "error");
    return false;
  }
}

function syncPropertyAccountFields() {
  const email = activeGuestAccountEmail();
  const link = activePropertyLink();
  const setupAcct = document.getElementById("setupGuestAccount");
  const setupLink = document.getElementById("setupPropertyLink");
  const guestAcct = document.getElementById("guestPropertyAccount");
  const label = document.getElementById("guestAccountEmailLabel");
  if (setupAcct && document.activeElement !== setupAcct) setupAcct.value = email;
  if (setupLink && document.activeElement !== setupLink) setupLink.value = link;
  if (guestAcct && document.activeElement !== guestAcct) guestAcct.value = email;
  syncPropertyLocationFields();
  if (label) label.textContent = email;
  const hint = document.getElementById("setupGuestAccountHint");
  if (hint) {
    const acct = email?.includes("@")
      ? `with <strong>${esc(email)}</strong>`
      : "(optional — set a TV Google account above)";
    hint.innerHTML = `Property “${esc(activePropertyName())}”${link ? ` · link <code>${esc(link)}</code>` : ""} — on each TV sign in on the <strong>main profile</strong> (Android user 0) ${acct} before streaming sync or clearing logins.`;
  }
  renderGuestSignInHints({
    guest_google_account: email,
    profile_short: "Main profile · Android user 0",
    configured: Boolean(email?.includes("@")),
  });
  syncPropertyIdentityFields();
}

function guestPagePreviewPath(propertyId = activePropertyId) {
  const id = parseInt(propertyId, 10) || 1;
  return `/guest/?hub_preview=1&property_id=${id}`;
}

function guestPagePreviewUrl(propertyId = activePropertyId) {
  return `${window.location.origin}${guestPagePreviewPath(propertyId)}`;
}

function syncPropertyIdentityFields() {
  const id = activePropertyId || 1;
  const name = activePropertyName();
  const path = guestPagePreviewPath(id);
  const fullUrl = guestPagePreviewUrl(id);

  const setText = (elId, text) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = text;
  };
  setText("setupPropertyId", String(id));
  setText("setupPropertyIdHint", String(id));
  setText("guestExperiencePropertyId", String(id));
  setText("guestExperiencePropertyName", name || "—");
  setText("setupPropertyGuestPageUrl", fullUrl);

  ["setupPropertyGuestPageLink", "guestExperienceGuestPageLink"].forEach(linkId => {
    const link = document.getElementById(linkId);
    if (link) link.href = path;
  });
}

async function setActiveProperty(propertyId, { reload = true } = {}) {
  const id = parseInt(propertyId, 10);
  if (!id || id === activePropertyId) return;
  try {
    await api("/aatomhome/setup/active-property", {
      method: "PUT",
      body: { property_id: id },
    });
    activePropertyId = id;
    syncPropertyAccountFields();
    syncPropertyIdentityFields();
    if (reload) {
      await loadSetupStatus();
      await loadGuestWelcome();
      await loadStreamingMatrix?.();
      await loadGuestExperience();
    }
  } catch (err) {
    toast(err.message || "Could not switch property", "error");
  }
}

async function savePropertyGuestAccount(email, { silent = false } = {}) {
  const trimmed = email.trim();
  if (trimmed && !trimmed.includes("@")) {
    toast("TV Google account must be an email address, or leave blank", "error");
    return false;
  }
  try {
    const res = await api(`/aatomhome/properties/${activePropertyId}/guest-account`, {
      method: "PUT",
      body: { guest_google_account: trimmed },
    });
    const idx = hubProperties.findIndex(p => p.id === activePropertyId);
    if (idx >= 0) hubProperties[idx].guest_google_account = res.guest_google_account;
    syncPropertyAccountFields();
    if (!silent) toast(`Saved TV account for ${activePropertyName()}`, "success");
    return true;
  } catch (err) {
    toast(err.message || "Save failed", "error");
    return false;
  }
}

async function loadSetupStatus() {
  const checklist = document.getElementById("setupChecklist");
  if (checklist) checklist.innerHTML = '<li class="setup-checklist-item loading">Loading…</li>';
  try {
    const data = await api("/aatomhome/setup");
    const hub = data.hub || {};
    hubProperties = data.properties || [];
    activePropertyId = hub.active_property_id || activePropertyId || 1;
    renderPropertySelectOptions(document.getElementById("setupPropertySelect"), hubProperties, activePropertyId);
    renderPropertySelectOptions(document.getElementById("guestPropertySelect"), hubProperties, activePropertyId);
    syncPropertyAccountFields();
    syncPropertyLocationFields({ force: true });
    const ha = data.homeassistant || {};
    const integration = data.integration || {};

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value || "—";
    };
    setText("setupHubUrl", hub.public_url);
    setText("setupGuestUrl", hub.guest_url);
    setText("setupOnboardUrl", hub.onboard_url || `${(hub.public_url || "").replace(/\/$/, "")}/guest/onboard/`);
    setText("setupIntegrationHubUrl", integration.hub_url_hint || hub.public_url);
    const propInput = document.getElementById("setupPropertyName");
    if (propInput && hub.property_name) propInput.value = hub.property_name;

    const haUrl = document.getElementById("setupHaUrl");
    if (haUrl && ha.ha_url) haUrl.value = ha.ha_url;
    const tokenHint = document.getElementById("setupHaTokenHint");
    if (tokenHint) {
      tokenHint.textContent = ha.token_configured
        ? `Saved token: ${ha.token_preview || "••••"}`
        : "No token saved yet";
    }

    setupHaConnected = Boolean(ha.connected);
    if (!setupHaConnected) setupHaEntitiesCache = null;
    if (ha.connected) {
      setSetupHaBanner(true, `Connected to ${ha.location_name || "Home Assistant"}${ha.version ? ` (${ha.version})` : ""}`);
    } else if (ha.last_error) {
      setSetupHaBanner(false, ha.last_error);
    } else {
      setSetupHaBanner(false, "");
    }
    if (setupRoomExperienceDeviceId) {
      updateSetupRoomControlsUi();
    }

    const repo = document.getElementById("setupIntegrationRepo");
    if (repo && integration.repo) repo.href = integration.repo;
    const docs = document.getElementById("setupIntegrationDocs");
    if (docs && integration.docs) docs.href = integration.docs;

    const launcher = data.guest_launcher || {};
    const qrImg = document.getElementById("setupHubQr");
    if (qrImg && launcher.qr_url) qrImg.src = `${launcher.qr_url}?t=${Date.now()}`;
    setText("setupLauncherHubUrl", launcher.hub_url || hub.public_url);
    const apkLink = document.getElementById("setupApkDownload");
    if (apkLink) {
      if (launcher.available && launcher.download_url) {
        apkLink.href = launcher.download_url;
        apkLink.classList.remove("disabled");
      } else {
        apkLink.href = "#";
        apkLink.classList.add("disabled");
      }
    }
    const apkMeta = document.getElementById("setupApkMeta");
    if (apkMeta) {
      if (launcher.available) {
        const mb = launcher.size_bytes ? ` (${(launcher.size_bytes / 1024 / 1024).toFixed(1)} MB)` : "";
        apkMeta.textContent = `Package ${launcher.package || "com.aatomhome.guestwelcome"}${mb}`;
      } else {
        apkMeta.textContent = "APK not bundled — rebuild hub image with guest launcher";
      }
    }
    const provDoc = document.getElementById("setupProvisioningDoc");
    if (provDoc && launcher.provisioning_doc) provDoc.href = launcher.provisioning_doc;

    renderSetupChecklist(data.checklist || []);
    renderSetupGuestSignIn(data.guest_sign_in || hub.guest_sign_in);
    renderSetupProvisioningPaths(data.provisioning_paths || []);
    renderSetupTvList(data.tvs || {});
  } catch (err) {
    if (checklist) {
      checklist.innerHTML = `<li class="setup-checklist-item warn"><span class="setup-checklist-icon">!</span><div class="setup-checklist-body"><div class="setup-checklist-label">Could not load setup status</div><div class="setup-checklist-detail">${esc(err.message || "Hub API unavailable")}</div></div></li>`;
    }
  }
}

async function saveSetupHaConfig(e) {
  e?.preventDefault();
  const url = document.getElementById("setupHaUrl")?.value?.trim();
  const token = document.getElementById("setupHaToken")?.value?.trim();
  if (!url) {
    toast("Home Assistant URL is required", "error");
    return;
  }
  const body = { ha_url: url };
  if (token) body.ha_token = token;
  try {
    const res = await api("/aatomhome/setup/homeassistant", { method: "PUT", body });
    const tokenInput = document.getElementById("setupHaToken");
    if (tokenInput) tokenInput.value = "";
    if (res.test?.ok) {
      setSetupHaBanner(true, `Saved — connected to ${res.test.location_name || "Home Assistant"}`);
      toast("Home Assistant settings saved", "success");
    } else {
      setSetupHaBanner(false, res.test?.error || "Saved but connection test failed");
      toast("Saved — test connection failed", "error");
    }
    await loadSetupStatus();
  } catch (err) {
    toast(err.message || "Save failed", "error");
  }
}

async function testSetupHaConnection() {
  const url = document.getElementById("setupHaUrl")?.value?.trim();
  const token = document.getElementById("setupHaToken")?.value?.trim();
  const body = {};
  if (url) body.ha_url = url;
  if (token) body.ha_token = token;
  try {
    const res = await api("/aatomhome/setup/homeassistant/test", { method: "POST", body });
    if (res.ok) {
      setSetupHaBanner(true, `Connected to ${res.location_name || "Home Assistant"}${res.version ? ` (${res.version})` : ""}`);
      toast("Home Assistant connection OK", "success");
    } else {
      setSetupHaBanner(false, res.error || "Connection failed");
      toast(res.error || "Connection failed", "error");
    }
  } catch (err) {
    setSetupHaBanner(false, err.message || "Connection failed");
    toast(err.message || "Connection failed", "error");
  }
}

let activeSetupSection = "overview";
let setupRoomsCache = [];
let setupHaConnected = false;
let setupRoomConfigDraft = null;
let setupHaEntitiesCache = null;
let setupRoomExperienceDeviceId = null;

const SETUP_SECTION_LABELS = {
  overview: "Overview",
  property: "Property",
  ha: "Home Assistant",
  rooms: "Rooms & TVs",
  integration: "HA integration",
};

const SETUP_SECTION_LEADS = {
  overview: "Progress checklist and hub URLs.",
  property: "Property ID, guest page preview, address & weather, and welcome screen content.",
  ha: "Connect the hub to Home Assistant.",
  rooms: "Room codes, registered TVs, and provisioning paths.",
  integration: "Add the Home Assistant integration.",
};

function closeSetupDropdown() {
  const menu = document.getElementById("setupDropdownMenu");
  const toggle = document.getElementById("navSetupToggle");
  if (menu) menu.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function toggleSetupDropdown() {
  const menu = document.getElementById("setupDropdownMenu");
  const toggle = document.getElementById("navSetupToggle");
  if (!menu || !toggle) return;
  const open = menu.hidden;
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function navigateSetup(section, deviceId = null) {
  showHubView("setup");
  showSetupSection(section, deviceId);
  closeSetupDropdown();
}

function showSetupSection(section, deviceId = null) {
  const id = section || "overview";
  activeSetupSection = id;
  document.querySelectorAll(".setup-subnav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.setupSection === id && !btn.dataset.setupDeviceId);
  });
  document.querySelectorAll(".setup-panel").forEach(panel => {
    const on = panel.dataset.setupPanel === id;
    panel.classList.toggle("active", on);
    panel.hidden = !on;
  });
  const navCurrent = document.getElementById("setupNavCurrent");
  if (navCurrent) {
    if (id === "rooms" && deviceId) {
      const room = setupRoomsCache.find(d => d.id === deviceId);
      navCurrent.textContent = room ? (room.room_name || room.name || `Room ${room.id}`) : SETUP_SECTION_LABELS.rooms;
    } else {
      navCurrent.textContent = SETUP_SECTION_LABELS[id] || id;
    }
  }
  const lead = document.getElementById("setupViewLead");
  if (lead) lead.textContent = SETUP_SECTION_LEADS[id] || "";
  if (id === "property") {
    syncPropertyLocationFields({ force: true });
    syncPropertyIdentityFields();
    loadGuestWelcome();
  }
  if (id === "rooms" && deviceId) {
    selectSetupDevice(deviceId);
  } else if (id === "rooms" && setupRoomsCache.length && !setupSelectedDeviceId) {
    selectSetupDevice(setupRoomsCache[0].id);
  }
  try {
    localStorage.setItem("aatom_setup_section", id);
    if (deviceId) localStorage.setItem("aatom_setup_room_id", String(deviceId));
  } catch (_) { /* quota */ }
}

function restoreSetupSection() {
  let section = "overview";
  let roomId = null;
  try {
    section = localStorage.getItem("aatom_setup_section") || "overview";
    const savedRoom = localStorage.getItem("aatom_setup_room_id");
    if (savedRoom) roomId = parseInt(savedRoom, 10) || null;
  } catch (_) { /* ignore */ }
  if (!document.querySelector(`[data-setup-panel="${section}"]`)) section = "overview";
  showSetupSection(section, section === "rooms" ? roomId : null);
}

function showHubView(view) {
  activeHubView = view;
  document.querySelectorAll(".main-nav-link[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  const setupToggle = document.getElementById("navSetupToggle");
  if (setupToggle) setupToggle.classList.toggle("active", view === "setup");
  if (view !== "setup") closeSetupDropdown();
  const setupView = document.getElementById("setupView");
  const guestView = document.getElementById("guestExperienceView");
  const devicePanel = document.getElementById("devicePanel");
  const emptyState = document.getElementById("emptyState");
  const tvActionsBar = document.getElementById("tvActionsBar");

  if (setupView) setupView.style.display = view === "setup" ? "block" : "none";

  if (view === "setup") {
    if (guestView) guestView.style.display = "none";
    if (devicePanel) devicePanel.style.display = "none";
    if (emptyState) emptyState.style.display = "none";
    if (tvActionsBar) tvActionsBar.hidden = true;
    restoreSetupSection();
    loadSetupStatus();
    return;
  }

  if (view === "guest") {
    if (guestView) guestView.style.display = "block";
    if (devicePanel) devicePanel.style.display = "none";
    if (emptyState) emptyState.style.display = "none";
    updateGuestExperienceTvBadge();
    if (selectedDevice) updateConnectionUi();
    else {
      const guestBanner = document.getElementById("guestConnectionBanner");
      if (guestBanner) guestBanner.style.display = "none";
    }
    syncPropertyIdentityFields();
    loadGuestExperience();
    loadStreamingMatrix();
    if (selectedDevice && isDeviceOnline()) loadGuestStatus();
    else if (document.getElementById("guestStatusPanel")) {
      document.getElementById("guestStatusPanel").innerHTML =
        '<p style="color:var(--text-muted); padding:1rem;">Select a connected TV in the sidebar to manage streaming apps and launcher status.</p>';
    }
    updateGuestDeployUi();
    updateDeviceTypeUi();
    if (tvActionsBar) tvActionsBar.hidden = !selectedDevice;
  } else {
    if (guestView) guestView.style.display = "none";
    if (selectedDevice) {
      initializeDevicePanel();
    } else {
      if (devicePanel) devicePanel.style.display = "none";
      if (emptyState) emptyState.style.display = "block";
    }
    updateTvActionsBar();
  }
}

async function selectDevice(id) {
  selectedDevice = registry.find(d => d.id === id);
  if (!selectedDevice) return;
  if (activeHubView === "guest") {
    updateGuestExperienceTvBadge();
    updateConnectionUi();
    await loadRegistry();
    selectedDevice = registry.find(d => d.id === id) || selectedDevice;
    updateGuestExperienceTvBadge();
    updateConnectionUi();
    loadGuestExperience();
    loadStreamingMatrix();
    if (isDeviceOnline()) loadGuestStatus();
    updateGuestDeployUi();
    updateDeviceTypeUi();
    renderActivityLog();
    return;
  }
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("devicePanel").style.display = "block";
  document.getElementById("panelTitle").textContent = selectedDevice.name;
  updateConnectionUi();
  await loadRegistry();
  selectedDevice = registry.find(d => d.id === id) || selectedDevice;
  updateConnectionUi();
  updateDeviceTypeUi();
  loadOverview();
  loadGuestSummary();
  updateGuestDeployUi();
  loadGuestExperience();
  renderActivityLog();
}

async function loadGuestSummary() {
  const el = document.getElementById("guestOverview");
  const text = document.getElementById("guestOverviewText");
  if (!selectedDevice || !el || !text || !isDeviceOnline()) {
    if (el) el.style.display = "none";
    return;
  }
  el.style.display = "block";
  text.textContent = "Loading guest account status...";
  try {
    const s = await api(`/registry/${selectedDevice.id}/guest-status`);
    const guest = s.guest_account || s.guest_profile || {};
    const extraProfiles = s.extra_profile_count ?? Math.max(0, (s.profiles || []).length - 1);
    const expectedAcct = s.guest_google_account || activeGuestAccountEmail();
    const guestLine = guest.configured
      ? `Main profile: <strong>${esc(guest.accounts?.[0] || expectedAcct)}</strong>`
      : `<span style="color:var(--warning);">Guest account not on main profile — sign in with ${esc(expectedAcct)}</span>`;
    const accountsLine = extraProfiles === 0
      ? "Only the main profile on TV (good)"
      : `${extraProfiles} extra profile(s) on TV — remove them so only ${esc(expectedAcct)} remains`;
    text.innerHTML = `${guestLine}<br>${esc(accountsLine)}<br>`
      + `<span style="color:var(--text-muted);">${esc(s.recommendation || "")}</span>`;
  } catch (e) {
    text.textContent = e.message;
  }
}

function isSourceOrMainTv(device = selectedDevice) {
  if (!device) return false;
  if (device.is_streaming_source) return true;
  return /\bmain\b/i.test(device.name || "");
}

function updateGuestDeployUi() {
  const setupBtn = document.getElementById("btnGuestSetup");
  const deployAllBtn = document.getElementById("btnGuestDeployAll");
  const hint = document.getElementById("guestDeployHint");
  const isMain = isSourceOrMainTv();
  if (setupBtn) {
    setupBtn.textContent = isMain ? "Update all TVs from Main TV" : "Setup this TV only";
    setupBtn.title = isMain
      ? "Save welcome, update launcher on Main TV, then roll out to all other property TVs"
      : "Install/update launcher on the selected TV only (does not affect other TVs)";
  }
  if (deployAllBtn) {
    deployAllBtn.textContent = "Update all property TVs";
    deployAllBtn.title = "Save welcome and update launcher on every online property TV (Main TV first)";
  }
  if (hint) {
    const typeLabel = deviceTypeLabel(selectedDevice);
    const dtype = deviceProfile(selectedDevice).device_type || selectedDevice?.device_type;
    const typeHint = selectedDevice && dtype === "android_tv"
      ? `<strong>${esc(typeLabel)}:</strong> guest welcome and streaming work the same — you may need to pick <strong>Guest Welcome → Always</strong> on Home and tune Energy Saving / WoWLAN for wake. `
      : selectedDevice && dtype === "google_tv_streamer"
        ? `<strong>${esc(typeLabel)}:</strong> use apps-only mode and set <strong>Guest Welcome → Always</strong> on first Home press. `
        : "";
    hint.innerHTML = typeHint + (isMain
      ? "<strong>Main TV selected:</strong> use <strong>Update all TVs from Main TV</strong> to push welcome content and the launcher to every property TV in one step."
      : "Select <strong>Main TV</strong> to roll out updates to all TVs, or use <strong>Update all property TVs</strong> anytime.");
  }
  updateDeviceTypeUi();
}

function formatDeployResults(results) {
  const failed = (results || []).filter(x => !x.ok && !x.skipped);
  const skipped = (results || []).filter(x => x.skipped);
  const lines = [];
  if (failed.length) {
    lines.push(...failed.map(f => `${f.device_name || "TV"}: ${f.message || "failed"}`));
  }
  if (skipped.length) {
    lines.push(...skipped.map(s => `${s.device_name || "TV"}: offline`));
  }
  return lines;
}

function installMethodLabel(method) {
  const labels = {
    adb_install: "ADB install",
    install_existing: "Install existing",
    already_installed: "Already installed",
  };
  return labels[method] || method || "—";
}

function renderStreamingInstallLog(report, title = "Install status") {
  const panel = document.getElementById("streamingInstallLog");
  if (!panel) return;
  if (!report || !report.entries?.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  const summaryCls = report.failed ? "error" : (report.succeeded < report.total ? "warn" : "ok");
  const summaryText = report.failed
    ? `${report.succeeded} succeeded, ${report.failed} failed${report.skipped ? `, ${report.skipped} skipped` : ""}`
    : `${report.succeeded} succeeded${report.skipped ? `, ${report.skipped} skipped` : ""}`;

  panel.hidden = false;
  panel.innerHTML = `
    <div class="install-log-header">
      <span class="install-log-title">${esc(title)}</span>
      <div style="display:flex; align-items:center; gap:0.65rem;">
        <span class="install-log-summary ${summaryCls}">${esc(summaryText)}</span>
        <button type="button" class="btn btn-secondary btn-sm install-log-clear" id="btnClearInstallLog">Clear</button>
      </div>
    </div>
    <div class="install-log-body">
      ${report.entries.map(entry => {
        const badgeCls = entry.skipped ? "skip" : (entry.ok ? "ok" : "fail");
        const badgeText = entry.skipped ? "Skipped" : (entry.ok ? "OK" : "Failed");
        const steps = (entry.log || []).map(step => {
          const cls = step.ok ? "ok" : "fail";
          const phase = step.phase ? `${step.phase}: ` : "";
          return `<li class="${cls}">${esc(phase + (step.message || ""))}</li>`;
        }).join("");
        const method = entry.method ? `<span class="install-log-message">Method: ${esc(installMethodLabel(entry.method))}</span>` : "";
        const playStore = entry.needs_play_store
          ? `<div class="install-log-message" style="color:var(--warning); margin-top:0.2rem;">Install on source TV via Play Store, then retry.</div>`
          : "";
        return `<div class="install-log-entry">
          ${entry.device_name ? `<div class="install-log-entry-device">${esc(entry.device_name)}</div>` : ""}
          <div class="install-log-entry-head">
            <span class="install-log-entry-title">${esc(entry.label || entry.package || "App")}</span>
            <span class="install-log-badge ${badgeCls}">${badgeText}</span>
          </div>
          ${method}
          ${entry.message ? `<div class="install-log-message">${esc(entry.message)}</div>` : ""}
          ${playStore}
          ${steps ? `<ul class="install-log-steps">${steps}</ul>` : ""}
        </div>`;
      }).join("")}
    </div>`;

  document.getElementById("btnClearInstallLog")?.addEventListener("click", () => {
    panel.hidden = true;
    panel.innerHTML = "";
  });

  hubLogFromInstallReport(
    report,
    title,
    selectedDevice?.name || null,
    selectedDevice?.id ?? null,
  );
}

let guestWelcomeDefaults = {};

function fillGuestWelcomeForm(w) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
  set("guestWelcomeGuestName", w.guest_name);
  set("guestWelcomeEyebrow", w.hero_eyebrow);
  set("guestWelcomeTitle", w.title);
  set("guestWelcomeSubtitle", w.subtitle);
  set("guestWifiSsid", w.wifi_ssid);
  set("guestWifiPassword", w.wifi_password);
  set("guestCheckoutTime", w.checkout_time);
  set("guestGuidebookUrl", w.guidebook_url);
  set("guestThermostatInfo", w.thermostat_info);
  set("guestParkingInfo", w.parking_info);
  set("guestTrashInfo", w.trash_info);
  set("guestHouseRules", w.house_rules);
  set("guestLocalTips", w.local_tips);
  set("guestTvInstructions", w.tv_instructions);
  set("guestEmergencyName", w.emergency_name);
  set("guestEmergencyPhone", w.emergency_phone);
  set("guestWeatherLocation", w.weather_location_name);
  set("guestWeatherLat", w.weather_lat != null && w.weather_lat !== "" ? String(w.weather_lat) : "");
  set("guestWeatherLon", w.weather_lon != null && w.weather_lon !== "" ? String(w.weather_lon) : "");
  set("guestTempestStationId", w.tempest_station_id != null && w.tempest_station_id !== "" ? String(w.tempest_station_id) : "");
}

function fillGuestStayDates(stay) {
  const checkIn = stay?.check_in ? String(stay.check_in).slice(0, 10) : "";
  const checkOut = stay?.check_out ? String(stay.check_out).slice(0, 10) : "";
  const inEl = document.getElementById("guestCheckInDate");
  const outEl = document.getElementById("guestCheckOutDate");
  if (inEl) inEl.value = checkIn;
  if (outEl) outEl.value = checkOut;
}

function collectGuestStayDates() {
  const checkIn = document.getElementById("guestCheckInDate")?.value?.trim() || null;
  const checkOut = document.getElementById("guestCheckOutDate")?.value?.trim() || null;
  return { check_in: checkIn, check_out: checkOut };
}

function parseWeatherCoord(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function parseTempestStationId(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const num = Number.parseInt(text, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function collectGuestWelcomeForm(includeGuestName = true) {
  const body = {
    hero_eyebrow: document.getElementById("guestWelcomeEyebrow")?.value?.trim(),
    title: document.getElementById("guestWelcomeTitle")?.value?.trim(),
    subtitle: document.getElementById("guestWelcomeSubtitle")?.value?.trim(),
    wifi_ssid: document.getElementById("guestWifiSsid")?.value?.trim(),
    wifi_password: document.getElementById("guestWifiPassword")?.value?.trim(),
    wifi_security: "WPA",
    checkout_time: document.getElementById("guestCheckoutTime")?.value?.trim(),
    guidebook_url: document.getElementById("guestGuidebookUrl")?.value?.trim(),
    thermostat_info: document.getElementById("guestThermostatInfo")?.value?.trim(),
    parking_info: document.getElementById("guestParkingInfo")?.value?.trim(),
    trash_info: document.getElementById("guestTrashInfo")?.value?.trim(),
    house_rules: document.getElementById("guestHouseRules")?.value?.trim(),
    local_tips: document.getElementById("guestLocalTips")?.value?.trim(),
    tv_instructions: document.getElementById("guestTvInstructions")?.value?.trim(),
    emergency_name: document.getElementById("guestEmergencyName")?.value?.trim(),
    emergency_phone: document.getElementById("guestEmergencyPhone")?.value?.trim(),
    weather_location_name: document.getElementById("guestWeatherLocation")?.value?.trim(),
    weather_lat: parseWeatherCoord(document.getElementById("guestWeatherLat")?.value),
    weather_lon: parseWeatherCoord(document.getElementById("guestWeatherLon")?.value),
    tempest_station_id: parseTempestStationId(document.getElementById("guestTempestStationId")?.value),
  };
  if (includeGuestName) {
    body.guest_name = document.getElementById("guestWelcomeGuestName")?.value?.trim();
  }
  return body;
}

function updateGuestWelcomeMeta(data) {
  const meta = document.getElementById("guestWelcomeMeta");
  if (!meta) return;
  const stay = data?.active_stay;
  const overrides = data?.overrides || {};
  const overrideKeys = Object.keys(overrides).filter(k => overrides[k] !== "" && overrides[k] != null);
  const lines = [];
  if (stay?.guest_name) {
    lines.push(`Active stay: <strong>${esc(stay.guest_name)}</strong>`);
  }
  if (stay?.check_in || stay?.check_out) {
    const from = stay.check_in ? String(stay.check_in).slice(0, 10) : "—";
    const to = stay.check_out ? String(stay.check_out).slice(0, 10) : "—";
    lines.push(`Stay dates: ${esc(from)} → ${esc(to)} (weather forecast on TV)`);
  }
  if (overrideKeys.length) {
    lines.push(`Live overrides: ${overrideKeys.map(esc).join(", ")} — TVs show these instead of defaults for those fields.`);
  } else {
    lines.push("Live welcome matches property defaults (no overrides). Save welcome after edits to push changes to TVs.");
  }
  meta.innerHTML = lines.join("<br>");
}

async function loadGuestWelcome() {
  try {
    const data = await api(withPropertyId("/guest-welcome"));
    guestWelcomeDefaults = data.defaults || {};
    fillGuestWelcomeForm(data.welcome || {});
    fillGuestStayDates(data.active_stay);
    updateGuestWelcomeMeta(data);
    const logoEl = document.getElementById("guestWelcomeLogo");
    if (logoEl) {
      if (data.logo_url) {
        logoEl.src = `${data.logo_url}?t=${Date.now()}`;
        logoEl.classList.add("visible");
      } else {
        logoEl.classList.remove("visible");
        logoEl.removeAttribute("src");
      }
    }
    const bgEl = document.getElementById("guestWelcomeBackground");
    if (bgEl) {
      if (data.background_url) {
        bgEl.src = `${data.background_url}?t=${Date.now()}`;
        bgEl.classList.add("visible");
      } else {
        bgEl.classList.remove("visible");
        bgEl.removeAttribute("src");
      }
    }
    refreshGuestWelcomePreview();
  } catch (e) {
    console.warn("guest welcome load failed", e);
  }
}

function refreshGuestWelcomePreview() {
  const iframe = document.getElementById("guestWelcomePreview");
  if (!iframe) return;
  iframe.src = `/guest/?hub_preview=1&property_id=${activePropertyId}&t=${Date.now()}`;
}

async function saveGuestWelcome() {
  const r = await api(withPropertyId("/guest-welcome"), { method: "PUT", body: collectGuestWelcomeForm() });
  guestWelcomeDefaults = r.defaults || guestWelcomeDefaults;
  if (r.welcome) fillGuestWelcomeForm(r.welcome);
  updateGuestWelcomeMeta(r);
  refreshGuestWelcomePreview();
  return r;
}

async function saveGuestWelcomeWithToast() {
  try {
    await saveGuestWelcome();
    toast("Welcome screen saved (live TVs)", "success");
  } catch (e) { toast(e.message, "error"); }
}

async function saveGuestWelcomeDefaults() {
  const r = await api(withPropertyId("/guest-welcome/defaults"), { method: "PUT", body: collectGuestWelcomeForm(false) });
  guestWelcomeDefaults = r.defaults || guestWelcomeDefaults;
  if (r.welcome) fillGuestWelcomeForm(r.welcome);
  refreshGuestWelcomePreview();
  return r;
}

async function saveGuestWelcomeDefaultsWithToast() {
  try {
    await saveGuestWelcomeDefaults();
    toast("Property defaults saved", "success");
  } catch (e) { toast(e.message, "error"); }
}

function loadDefaultsIntoForm() {
  if (!guestWelcomeDefaults || !Object.keys(guestWelcomeDefaults).length) {
    toast("No property defaults saved yet", "error");
    return;
  }
  fillGuestWelcomeForm({ ...guestWelcomeDefaults, guest_name: document.getElementById("guestWelcomeGuestName")?.value?.trim() });
  toast("Loaded property defaults into form", "success");
}

async function resetWelcomeToDefaults() {
  if (!confirm("Reset the live welcome to property defaults?\n\nClears per-stay overrides (including guest name).")) return;
  try {
    const r = await api(withPropertyId("/guest-welcome/reset"), { method: "POST" });
    guestWelcomeDefaults = r.defaults || guestWelcomeDefaults;
    fillGuestWelcomeForm(r.welcome || {});
    updateGuestWelcomeMeta({ overrides: {}, active_stay: null });
    refreshGuestWelcomePreview();
    toast(r.message || "Reset to defaults", "success");
  } catch (e) { toast(e.message, "error"); }
}

async function checkInGuest() {
  const guestName = document.getElementById("guestWelcomeGuestName")?.value?.trim();
  if (!guestName) { toast("Enter a guest name first", "error"); return; }
  const checkoutTime = document.getElementById("guestCheckoutTime")?.value?.trim();
  const { check_in, check_out } = collectGuestStayDates();
  try {
    const r = await api(withPropertyId("/guest-stays/check-in"), {
      method: "POST",
      body: {
        guest_name: guestName,
        checkout_time: checkoutTime || null,
        check_in,
        check_out,
        apply_to_welcome: true,
      },
    });
    fillGuestWelcomeForm(r.welcome || {});
    fillGuestStayDates(r.active_stay);
    updateGuestWelcomeMeta({ active_stay: r.active_stay, overrides: { guest_name: guestName } });
    refreshGuestWelcomePreview();
    toast(r.message || `Checked in ${guestName}`, "success");
  } catch (e) { toast(e.message, "error"); }
}

async function checkOutGuest() {
  if (!confirm(
    "Check out guest and reset TVs for the next stay?\n\n" +
    "• Clears guest name from the welcome screen\n" +
    "• Signs out of Netflix, Disney+, and other streaming apps on all online TVs"
  )) return;
  try {
    const r = await api(withPropertyId("/guest-stays/check-out?clear_streaming=true"), { method: "POST" });
    fillGuestWelcomeForm(r.welcome || {});
    fillGuestStayDates(null);
    updateGuestWelcomeMeta({ active_stay: null, overrides: {} });
    refreshGuestWelcomePreview();
    toast(r.message || "Guest checked out", r.streaming_clear?.ok === false ? "error" : "success");
  } catch (e) { toast(e.message, "error"); }
}

async function uploadGuestWelcomeLogo(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch(withPropertyId("/guest-welcome/logo"), { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(formatApiError(err.detail) || res.statusText);
    }
    const data = await res.json();
    const logoEl = document.getElementById("guestWelcomeLogo");
    if (logoEl && data.logo_url) {
      logoEl.src = `${data.logo_url}?t=${Date.now()}`;
      logoEl.classList.add("visible");
    }
    refreshGuestWelcomePreview();
    toast("Logo uploaded", "success");
  } catch (e) { toast(e.message, "error"); }
}

async function uploadGuestWelcomeBackground(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch(withPropertyId("/guest-welcome/background"), { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(formatApiError(err.detail) || res.statusText);
    }
    const data = await res.json();
    const bgEl = document.getElementById("guestWelcomeBackground");
    if (bgEl && data.background_url) {
      bgEl.src = `${data.background_url}?t=${Date.now()}`;
      bgEl.classList.add("visible");
    }
    refreshGuestWelcomePreview();
    toast("Background uploaded", "success");
  } catch (e) { toast(e.message, "error"); }
}

async function applyGuestWelcome() {
  if (!selectedDevice || !isDeviceOnline()) { toast("Connect a TV first", "error"); return; }
  try {
    await saveGuestWelcome();
    const r = await api(`/registry/${selectedDevice.id}/guest-welcome/apply`, { method: "POST" });
    toast(r.message || "Welcome screen applied", r.ok ? "success" : "error");
  } catch (e) { toast(e.message, "error"); }
}

async function loadGuestExperience() {
  const statusEl = document.getElementById("guestExperienceStatus");
  const noteEl = document.getElementById("guestExperienceNote");
  try {
    const config = await api(withPropertyId("/guest-experience"));
    if (noteEl && config.guest_page_url) {
      noteEl.innerHTML = `TVs load the live welcome page at <a href="${esc(config.guest_page_url)}" target="_blank" rel="noopener">${esc(config.guest_page_url)}</a>`;
    }
    if (!selectedDevice || !isDeviceOnline()) {
      if (statusEl) statusEl.textContent = "Connect a TV to see guest launcher status.";
      return;
    }
    const s = await api(`/registry/${selectedDevice.id}/guest-experience/status`);
    const launcher = s.launcher || {};
    if (statusEl) {
      const expectedAcct = s.guest_experience?.guest_google_account || s.guest_google_account || activeGuestAccountEmail();
      const accountLine = s.guest_account_configured
        ? `Signed in as <strong>${esc(expectedAcct)}</strong>`
        : `<span style="color:var(--warning);">Sign in with ${esc(expectedAcct)} on the main profile</span>`;
      const roleLine = isSourceOrMainTv(selectedDevice)
        ? `Role: <strong>Main TV</strong> — updates here roll out to all property TVs`
        : `Role: bedroom/other TV`;
      statusEl.innerHTML = [
        accountLine,
        roleLine,
        `Launcher installed: <strong>${launcher.installed ? "yes" : "no"}</strong>`,
        `Default home: <strong>${launcher.is_default_home ? "yes" : "no"}</strong>`,
        `Screensaver: <strong>${launcher.screensaver_component ? "Stock Google TV" : "not set"}</strong>`,
      ].join(" · ");
    }
    updateGuestDeployUi();
  } catch (e) {
    if (statusEl) statusEl.textContent = e.message;
  }
}

async function setupGuestExperience() {
  if (!selectedDevice || !isDeviceOnline()) { toast("Connect a TV first", "error"); return; }
  try {
    await saveGuestWelcome();
  } catch (e) { toast(e.message, "error"); return; }
  const isMain = isSourceOrMainTv();
  const msg = isMain
    ? "Update guest welcome on Main TV and roll out to all other property TVs?\n\nSaves welcome content, reinstalls the launcher, configures screensaver, and syncs streaming apps on each online TV."
    : "Set up guest welcome launcher on this TV only?\n\nInstalls on the main profile, syncs streaming apps, and opens the welcome screen. Other TVs are not changed.";
  if (!confirm(msg)) return;
  hubLog({
    level: "info",
    category: "setup",
    message: "Guest setup started",
    deviceName: selectedDevice?.name,
    deviceId: selectedDevice?.id,
  });
  try {
    const r = await api(`/registry/${selectedDevice.id}/guest-experience/setup`, {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    const toastType = r.ok ? "success" : "error";
    toast(r.message || "Guest experience applied", toastType);
    const note = document.getElementById("guestExperienceNote");
    const lines = [];
    if (r.manual_steps?.length) {
      lines.push(...r.manual_steps.map(x => `• ${esc(x)}`));
    }
    if (r.cascaded) {
      const cascadeLines = formatDeployResults(r.cascade_results);
      if (cascadeLines.length) {
        lines.push("<br><strong>Other TVs:</strong>");
        lines.push(...cascadeLines.map(x => `• ${esc(x)}`));
      } else if (r.cascade_synced) {
        lines.push(`<br>Rolled out to ${r.cascade_synced} other TV(s).`);
      }
    }
    if (note && lines.length) note.innerHTML = lines.join("<br>");
    hubLogOperationResponse("Guest setup", r, {
      category: "setup",
      deviceName: selectedDevice?.name,
      deviceId: selectedDevice?.id,
    });
    loadGuestExperience();
  } catch (e) { toast(e.message, "error"); }
}

async function deployGuestExperienceAll() {
  try {
    await saveGuestWelcome();
  } catch (e) { toast(e.message, "error"); return; }
  if (!confirm(
    "Update all property TVs?\n\nSaves welcome content, then installs/updates the guest launcher on every online TV (Main TV first). Welcome text itself is live from the hub — no redeploy needed for text-only edits."
  )) return;
  hubLog({ level: "info", category: "setup", message: "Deploy all TVs started" });
  try {
    const sourceId = isSourceOrMainTv() ? selectedDevice.id : null;
    const path = sourceId
      ? `/registry/deploy-guest-experience?source_device_id=${sourceId}`
      : "/registry/deploy-guest-experience";
    const r = await api(path, {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    const failed = (r.results || []).filter(x => !x.ok && !x.skipped);
    const toastType = r.ok ? (failed.length ? "error" : "success") : "error";
    let detail = r.message || "Update complete";
    const extra = formatDeployResults(r.results);
    if (extra.length) detail += " — " + extra.join("; ");
    toast(detail, toastType);
    const note = document.getElementById("guestExperienceNote");
    if (note && extra.length) {
      note.innerHTML = "<strong>Deploy details:</strong><br>" + extra.map(x => `• ${esc(x)}`).join("<br>");
    }
    hubLogOperationResponse("Deploy all TVs", r, { category: "setup" });
    loadGuestExperience();
  } catch (e) { toast(e.message, "error"); }
}

async function restoreGuestExperience() {
  if (!selectedDevice || !isDeviceOnline()) { toast("Connect a TV first", "error"); return; }
  if (!confirm("Restore stock Google TV launcher on the main profile?")) return;
  try {
    const r = await api(`/registry/${selectedDevice.id}/guest-experience/restore`, { method: "POST" });
    toast(r.message || "Restored", r.ok ? "success" : "error");
    loadGuestExperience();
  } catch (e) { toast(e.message, "error"); }
}

async function wakeAndResetWelcome() {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  if (!confirm(
    `Wake ${selectedDevice.name} and reset the guest welcome screen?\n\n`
    + "The hub will reconnect for up to 90 seconds. If the TV is in network standby, "
    + "press the power button on the remote once when prompted."
  )) return;
  hubLog({
    level: "info",
    category: "power",
    message: "Wake & reset welcome started",
    deviceName: selectedDevice.name,
    deviceId: selectedDevice.id,
  });
  try {
    const r = await api(`/registry/${selectedDevice.id}/wake-and-reset?wait_seconds=90`, {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    hubLogOperationResponse("Wake & reset welcome", r, {
      category: "power",
      deviceName: selectedDevice.name,
      deviceId: selectedDevice.id,
    });
    toast(r.message || (r.reset_ok ? "Welcome reset" : "Wake failed"), r.reset_ok ? "success" : "error");
    const note = document.getElementById("guestExperienceNote");
    if (note) {
      const lines = [];
      if (r.hint) lines.push(esc(r.hint));
      if (r.manual_steps?.length) lines.push(...r.manual_steps.map(x => `• ${esc(x)}`));
      if (lines.length) note.innerHTML = lines.join("<br>");
    }
    await loadRegistry();
    loadGuestExperience();
  } catch (e) { toast(e.message, "error"); }
}

async function sleepSelectedTv() {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  if (!isDeviceOnline()) { toast("Connect the TV first", "error"); return; }
  if (!confirm(
    `Put ${selectedDevice.name} to sleep?\n\n`
    + "The display will turn off. ADB stays connected when network standby is enabled."
  )) return;
  try {
    hubLogPowerAction("Sleep", selectedDevice, { requested: true });
    const r = await api(`/registry/${selectedDevice.id}/sleep`, { method: "POST" });
    hubLogPowerAction("Sleep", selectedDevice, { requested: false, response: r });
    toast(r.message || (r.ok ? "TV sleeping" : "Sleep failed"), r.ok ? "success" : "error");
  } catch (e) { toast(e.message, "error"); }
}

async function rebootSelectedTv() {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  if (!isDeviceOnline()) { toast("Connect the TV first", "error"); return; }
  if (!confirm(
    `Reboot ${selectedDevice.name}?\n\n`
    + "The TV will restart and may take 1–2 minutes to come back online."
  )) return;
  hubLogPowerAction("Reboot", selectedDevice, { requested: true });
  try {
    const r = await api(`/registry/${selectedDevice.id}/reboot`, {
      method: "POST",
      body: JSON.stringify({ mode: "" }),
    });
    hubLogPowerAction("Reboot", selectedDevice, { requested: false, response: r });
    toast(r.message || (r.ok ? "Reboot sent" : "Reboot failed"), r.ok ? "success" : "error");
    await loadRegistry();
  } catch (e) { toast(e.message, "error"); }
}

async function wakeBedroomTvs() {
  if (!confirm(
    "Wake Bedroom TV 2 and Bedroom TV 3 and reset guest welcome on each?\n\n"
    + "Press power on each bedroom TV remote if they stay offline."
  )) return;
  hubLog({ level: "info", category: "power", message: "Wake bedroom TVs started" });
  try {
    const r = await api("/registry/wake-bedroom-tvs?wait_seconds=90", {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    hubLogOperationResponse("Wake bedroom TVs", r, { category: "power" });
    toast(r.message || "Bedroom TV wake complete", r.ok ? "success" : "error");
    const note = document.getElementById("guestExperienceNote");
    if (note && r.results?.length) {
      note.innerHTML = "<strong>Bedroom TVs:</strong><br>"
        + r.results.map(x => `• ${esc(x.device_name)}: ${esc(x.message || x.state || "—")}`).join("<br>");
    }
    await loadRegistry();
    loadGuestExperience();
  } catch (e) { toast(e.message, "error"); }
}

async function promptPairingCredentials() {
  let pairingPort = selectedDevice?.pairing_port;
  let pairingCode = selectedDevice?.pairing_code;
  const freshPort = prompt(
    "Pairing port from TV (Wireless debugging → Pair device with pairing code):",
    pairingPort ? String(pairingPort) : "",
  );
  if (freshPort === null) return null;
  if (freshPort) pairingPort = parseInt(freshPort, 10);
  const freshCode = prompt("6-digit pairing code from TV (expires in ~60 seconds):", "");
  if (freshCode === null) return null;
  if (freshCode) pairingCode = freshCode.trim();
  if (!pairingPort || !pairingCode) {
    toast("Pairing port and code required", "error");
    return null;
  }
  return { pairing_port: pairingPort, pairing_code: pairingCode };
}

function renderProvisionNote(r) {
  const note = document.getElementById("guestExperienceNote");
  if (!note) return;
  const lines = [];
  for (const phase of r.phases || []) {
    const label = phase.phase || "step";
    lines.push(`<strong>${esc(label)}</strong>: ${esc(phase.message || (phase.ok ? "ok" : "failed"))}`);
    for (const msg of phase.messages || []) {
      lines.push(`&nbsp;&nbsp;• ${esc(msg)}`);
    }
    if (phase.note) lines.push(`&nbsp;&nbsp;<em>${esc(phase.note)}</em>`);
  }
  if (r.manual_steps?.length) {
    lines.push("<br><strong>Manual on TV:</strong>");
    lines.push(...r.manual_steps.map(x => `• ${esc(x)}`));
  }
  note.innerHTML = lines.join("<br>");
}

async function runAdbAutoEnable(creds) {
  const out = document.getElementById("serverOutput");
  toast("Installing ADB reboot helper (Owner profile)...");
  hubLog({
    level: "info",
    category: "setup",
    message: "ADB reboot helper install started",
    deviceName: selectedDevice?.name,
    deviceId: selectedDevice?.id,
  });
  const r = await api(`/registry/${selectedDevice.id}/adb-auto-enable`, {
    method: "POST",
    timeout: API_LONG_TIMEOUT_MS,
    body: JSON.stringify(creds),
  });
  if (out) {
    out.textContent = (r.messages || []).join("\n") + (r.note ? `\n\n${r.note}` : "");
    if (r.status) out.textContent += `\n\nStatus: ${JSON.stringify(r.status, null, 2)}`;
  }
  hubLogOperationResponse("ADB reboot helper", r, {
    category: "setup",
    deviceName: selectedDevice?.name,
    deviceId: selectedDevice?.id,
  });
  toast(r.ok ? "ADB reboot helper ready" : "Setup incomplete — see output", r.ok ? "success" : "error");
  return r;
}

async function deployLauncherToDevice(deviceId, options = {}) {
  const {
    launchWelcome = true,
    forceReinstall = true,
    label = "Push welcome app",
  } = options;
  const device = (registry || []).find(d => d.id === deviceId) || selectedDevice;
  if (!device) { toast("Select a TV first", "error"); return null; }
  if (device.connection_state !== "device" && !isDeviceOnline()) {
    toast("Connect the TV over ADB first (Pair → Connect)", "error");
    return null;
  }
  toast(`${label} — installing from hub APK…`);
  hubLog({
    level: "info",
    category: "setup",
    message: label,
    deviceName: device?.name,
    deviceId: device.id,
  });
  try {
    const r = await api(`/aatomhome/registry/${device.id}/deploy-launcher`, {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
      body: JSON.stringify({
        set_home: true,
        launch_welcome: launchWelcome,
        force_reinstall: forceReinstall,
        start_agent: true,
        auto_claim: true,
      }),
    });
    renderProvisionNote(r);
    hubLogOperationResponse(label, r, {
      category: "setup",
      deviceName: device?.name,
      deviceId: device.id,
    });
    toast(r.message || label, r.ok ? "success" : "error");
    await loadRegistry();
    await loadGuestExperience();
    return r;
  } catch (e) {
    toast(e.message, "error");
    return null;
  }
}

async function deployLauncherToAllOnline() {
  if (!confirm(
    "Push welcome app to every TV that is online over ADB?\n\n"
    + "Installs/updates the launcher APK from this hub on each connected TV."
  )) return;
  hubLog({ level: "info", category: "setup", message: "Push welcome app to all online" });
  try {
    const r = await api("/aatomhome/registry/deploy-launcher", {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
      body: JSON.stringify({
        online_only: true,
        set_home: true,
        launch_welcome: true,
        force_reinstall: true,
      }),
    });
    const lines = (r.results || []).map(x =>
      `${x.device_name || x.device_id}: ${x.ok ? "OK" : x.message || "failed"}`
    );
    toast(r.message || "Bulk deploy finished", r.ok ? "success" : "error");
    const note = document.getElementById("guestExperienceNote");
    if (note && lines.length) note.innerHTML = lines.map(x => `• ${esc(x)}`).join("<br>");
    hubLogOperationResponse("Push all online", r, { category: "setup" });
    await loadRegistry();
    await loadSetupStatus();
  } catch (e) { toast(e.message, "error"); }
}

async function provisionNewTv() {
  if (!selectedDevice || !isDeviceOnline()) { toast("Connect a TV first", "error"); return; }
  await saveGuestWelcome();
  const skipPair = confirm(
    "Full provision (Google TV lockdown lockdown)?\n\n"
    + "OK = continue full provision (ADB helper, streaming, apps-only).\n"
    + "Cancel = use Push welcome app instead (recommended for Shield / simple deploy)."
  );
  if (!skipPair) {
    await deployLauncherToDevice(selectedDevice.id, { label: "Push welcome app" });
    return;
  }
  const msg = [
    "Full provision for this TV?",
    "",
    "This will:",
    "• Install ADB reboot helper (optional — needs fresh pairing code)",
    "• Install guest welcome launcher + streaming apps",
    "• Enable Google TV apps-only mode (Google TV only)",
    "",
    "If already paired, choose Skip on the next dialog.",
  ].join("\n");
  if (!confirm(msg)) return;
  let creds = { setup_adb_helper: false };
  if (confirm("Install ADB reboot helper now?\n\nCancel = skip (TV already paired / Shield network debugging).")) {
    const pair = await promptPairingCredentials();
    if (!pair) return;
    creds = { ...pair, setup_adb_helper: true };
  }
  toast("Provisioning TV — this may take a few minutes...");
  hubLog({
    level: "info",
    category: "setup",
    message: "TV provision started",
    deviceName: selectedDevice?.name,
    deviceId: selectedDevice?.id,
  });
  try {
    const r = await api(`/registry/${selectedDevice.id}/provision`, {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
      body: creds,
    });
    renderProvisionNote(r);
    hubLogOperationResponse("Provision TV", r, {
      category: "setup",
      deviceName: selectedDevice?.name,
      deviceId: selectedDevice?.id,
    });
    toast(r.message || "Provision complete", r.ok ? "success" : "error");
    loadGuestExperience();
    loadRegistry();
  } catch (e) { toast(e.message, "error"); }
}

async function enableAppsOnlyMode() {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  if (!isDeviceOnline()) { toast("Connect the TV first", "error"); return; }
  if (!deviceCapabilities(selectedDevice).apps_only_mode) {
    toast("Apps only mode is only available on Google TV", "error");
    return;
  }
  if (!confirm(
    `Enable Apps only mode on ${selectedDevice.name}?\n\n`
    + "This hides Google TV personalized recommendations on the home screen. "
    + "If ADB cannot confirm it, enable manually on the TV under Settings → Accounts."
  )) return;
  hubLog({
    level: "info",
    category: "setup",
    message: "Apps only mode requested",
    deviceName: selectedDevice.name,
    deviceId: selectedDevice.id,
  });
  try {
    const r = await api(`/registry/${selectedDevice.id}/apps-only-mode`, { method: "POST" });
    hubLogOperationResponse("Apps only mode", r, {
      category: "setup",
      deviceName: selectedDevice.name,
      deviceId: selectedDevice.id,
    });
    const note = document.getElementById("guestExperienceNote");
    if (note) {
      const lines = [];
      if (r.manual_steps?.length) lines.push(...r.manual_steps.map(x => `• ${esc(x)}`));
      if (r.status_after?.recent_lines?.length) {
        lines.push("<strong>Launcher status:</strong>");
        lines.push(...r.status_after.recent_lines.map(x => `• ${esc(x)}`));
      }
      if (lines.length) note.innerHTML = lines.join("<br>");
    }
    toast(r.message || (r.ok ? "Apps only mode enabled" : "Could not confirm"), r.ok ? "success" : "error");
  } catch (e) { toast(e.message, "error"); }
}

async function ensureGuestReady() {
  if (!selectedDevice || !isDeviceOnline()) { toast("Connect a TV first", "error"); return; }
  const caps = deviceCapabilities(selectedDevice);
  const appsOnlyLine = caps.apps_only_mode
    ? "• Enable apps-only mode\n"
    : "";
  if (!confirm(
    "Ensure this TV is guest-ready?\n\n" +
    "• Persist wireless debugging / dev options\n" +
    "• Sync guest launcher + streaming apps\n" +
    appsOnlyLine +
    "\nYou'll be asked next whether to refresh the ADB reboot helper."
  )) return;

  let creds = null;
  if (confirm("Refresh ADB reboot helper now?\n\nChoose OK only if wireless debugging was reset or pairing expired.")) {
    creds = await promptPairingCredentials();
    if (!creds) return;
  }

  toast("Ensuring TV is guest-ready...");
  hubLog({
    level: "info",
    category: "setup",
    message: "Ensure guest-ready started",
    deviceName: selectedDevice?.name,
    deviceId: selectedDevice?.id,
  });
  try {
    const r = await api(`/registry/${selectedDevice.id}/ensure-guest-ready`, {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
      body: creds || {},
    });
    renderProvisionNote(r);
    hubLogOperationResponse("Ensure guest-ready", r, {
      category: "setup",
      deviceName: selectedDevice?.name,
      deviceId: selectedDevice?.id,
    });
    toast(r.message || "TV ensure complete", r.ok ? "success" : "error");
    loadGuestExperience();
    loadRegistry();
  } catch (e) { toast(e.message, "error"); }
}

async function loadStreamingMirrorBanner() {
  const el = document.getElementById("streamingMirrorBanner");
  if (!el) return;
  try {
    const info = await api("/registry/streaming-source");
    if (!info.source) {
      el.style.display = "block";
      el.innerHTML = "No streaming source TV set. Pick your Main TV and click <strong>Set as Source</strong>, then configure apps and mirror.";
      return;
    }
    const labels = (info.enabled_labels || []).join(", ") || "none selected yet";
    const isSource = selectedDevice?.id === info.source.id;
    el.style.display = "block";
    el.innerHTML = `Streaming source: <strong>${esc(info.source.name)}</strong>${isSource ? " (this TV)" : ""} — ${esc(labels)}`;
  } catch {
    el.style.display = "none";
  }
}

async function setStreamingSource() {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  try {
    const r = await api(`/registry/${selectedDevice.id}/streaming-source`, { method: "POST" });
    toast(r.message || "Source TV updated", "success");
    await loadRegistry();
    selectedDevice = registry.find(d => d.id === selectedDevice.id) || selectedDevice;
    loadStreamingMirrorBanner();
  } catch (e) { toast(e.message, "error"); }
}

async function mirrorStreamingApps() {
  if (!confirm(
    "Mirror streaming apps from the source TV to all other connected TVs?\n\n"
    + "Offline TVs will be skipped."
  )) return;

  const btn = document.getElementById("btnMirrorStreaming");
  if (btn) btn.disabled = true;
  try {
    const r = await api("/registry/mirror-streaming-apps", {
      method: "POST",
      body: {},
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    const lines = (r.results || []).map(x => x.message || `${x.device_name}: ${x.ok ? "ok" : x.reason || "failed"}`);
    toast(r.message || "Mirror complete", r.ok ? "success" : "error");
    if (lines.length) {
      const panel = document.getElementById("streamingAppsNote");
      if (panel) panel.textContent = lines.join(" · ");
    }
    hubLogOperationResponse("Mirror streaming apps", r, { category: "install" });
    if (selectedDevice) await loadStreamingApps();
    loadGuestSummary();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

let streamingCatalogData = null;

async function loadStreamingCatalog() {
  const list = document.getElementById("streamingCatalogList");
  if (!list) return;
  try {
    const data = await api("/properties/1/streaming-apps/catalog");
    streamingCatalogData = data;
    renderStreamingCatalog(data);
  } catch (e) {
    list.innerHTML = `<p style="color:var(--danger); font-size:0.85rem;">${esc(e.message)}</p>`;
  }
}

function renderStreamingCatalog(data) {
  const list = document.getElementById("streamingCatalogList");
  if (!list) return;
  const apps = data?.apps || [];
  if (!apps.length) {
    list.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No streaming apps in catalog.</p>';
    return;
  }
  list.innerHTML = apps.map(app => {
    const tags = [];
    if (app.builtin) tags.push('<span class="streaming-tag">Built-in</span>');
    if (app.custom) tags.push('<span class="streaming-tag streaming-tag--custom">Custom</span>');
    const tagHtml = tags.length ? `<span class="streaming-catalog-tags">${tags.join("")}</span>` : "";
    const removeBtn = app.custom
      ? `<button type="button" class="btn btn-secondary btn-sm streaming-catalog-remove" data-package="${esc(app.package)}">Remove</button>`
      : "";
    return `<div class="streaming-catalog-item">
      <span class="streaming-catalog-label">${esc(app.label)}</span>
      ${tagHtml}
      ${removeBtn}
      <code class="streaming-catalog-package">${esc(app.package)}</code>
    </div>`;
  }).join("");
}

async function addCustomStreamingApp(e) {
  e.preventDefault();
  const pkgInput = document.getElementById("customStreamingPackage");
  const labelInput = document.getElementById("customStreamingLabel");
  const packageName = (pkgInput?.value || "").trim();
  const label = (labelInput?.value || "").trim();
  if (!packageName || !label) {
    toast("Package name and label are required", "error");
    return;
  }
  try {
    const r = await api("/properties/1/streaming-apps/custom", {
      method: "POST",
      body: JSON.stringify({ package: packageName, label }),
    });
    toast(r.message || `Added ${label}`, "success");
    if (pkgInput) pkgInput.value = "";
    if (labelInput) labelInput.value = "";
    await loadStreamingMatrix();
    if (selectedDevice && isDeviceOnline()) await loadStreamingApps();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function removeCustomStreamingApp(packageName) {
  if (!confirm(`Remove custom app ${packageName} from the catalog?`)) return;
  try {
    await api(`/properties/1/streaming-apps/custom/${encodeURIComponent(packageName)}`, {
      method: "DELETE",
    });
    toast("Custom app removed", "success");
    await loadStreamingMatrix();
    if (selectedDevice && isDeviceOnline()) await loadStreamingApps();
  } catch (err) {
    toast(err.message, "error");
  }
}

let streamingAppsBusy = false;
let streamingCatalog = null;
let streamingPendingPackages = null;
let streamingMatrixData = null;
let streamingMatrixBusy = false;
let streamingMatrixSelected = null;

function matrixCellIcon(cell, online) {
  if (!online || cell?.enabled === null || cell?.enabled === undefined) return "—";
  if (cell.enabled) return "✓";
  if (cell.installed) return "○";
  return "✗";
}

function matrixCellClass(cell, online, isMismatch) {
  if (!online) return "matrix-offline matrix-unknown";
  if (isMismatch) return "matrix-mismatch";
  if (cell?.enabled) return "matrix-ok";
  if (cell?.installed) return "matrix-unknown";
  return "matrix-mismatch";
}

function getCheckedMatrixPackages() {
  return [...document.querySelectorAll(".streaming-matrix-checkbox:checked")]
    .map(el => el.dataset.package)
    .filter(Boolean);
}

function renderStreamingMatrix(matrix) {
  streamingMatrixData = matrix;
  const wrap = document.getElementById("streamingMatrixWrap");
  const summary = document.getElementById("streamingMatrixSummary");
  const installBtn = document.getElementById("btnMatrixInstallAll");
  const matchBtn = document.getElementById("btnMatrixMatchSource");
  if (!wrap) return;

  const apps = matrix?.apps || [];
  const devices = matrix?.devices || [];
  const mismatches = matrix?.mismatch_count || 0;
  const checkedSet = new Set(
    streamingMatrixSelected || apps.filter(a => {
      const anyMissing = devices.some(d => {
        if (!d.online) return false;
        const cell = d.cells?.[a.package];
        return cell && !cell.enabled;
      });
      return anyMissing;
    }).map(a => a.package),
  );

  if (summary) {
    const sourceName = matrix?.source_device_name || "Main TV";
    const onlineCount = devices.filter(d => d.online).length;
    summary.innerHTML = [
      `<strong>${apps.length}</strong> catalog app(s) · <strong>${devices.length}</strong> TV(s)`,
      ` · <strong>${onlineCount}</strong> online`,
      mismatches
        ? ` · <span style="color:var(--danger);"><strong>${mismatches}</strong> mismatch(es) vs ${esc(sourceName)}</span>`
        : ` · <span style="color:var(--success);">All TVs match ${esc(sourceName)}</span>`,
    ].join("");
  }

  if (!apps.length || !devices.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">No TVs or apps configured for this property.</p>';
    return;
  }

  const mismatchKeys = new Set(
    (matrix.mismatches || [])
      .filter(m => m.issue === "missing" || m.issue === "extra")
      .map(m => `${m.device_id}:${m.package}`),
  );

  const headerCells = devices.map(d => {
    const statusCls = d.online ? "online" : "offline";
    const statusText = d.online ? "online" : (d.connection_state || "offline");
    const sourceTag = d.is_source ? '<span class="source-tag">Source</span>' : "";
    const colCls = d.is_source ? "matrix-source-col" : "";
    return `<th class="${colCls}"><div class="streaming-matrix-device-head">${sourceTag}<span>${esc(d.device_name)}</span><span class="device-status ${statusCls}">${esc(statusText)}</span></div></th>`;
  }).join("");

  const rows = apps.map(app => {
    const checked = checkedSet.has(app.package);
    const cells = devices.map(d => {
      const cell = d.cells?.[app.package] || {};
      const isMismatch = mismatchKeys.has(`${d.device_id}:${app.package}`);
      const cls = matrixCellClass(cell, d.online, isMismatch);
      const icon = matrixCellIcon(cell, d.online);
      const title = !d.online
        ? "TV offline"
        : cell.enabled
          ? "Installed & enabled"
          : cell.installed
            ? "Installed but disabled"
            : "Not installed";
      return `<td class="${cls}" title="${esc(title)}">${icon}</td>`;
    }).join("");
    return `<tr>
      <td class="matrix-app-col">
        <label class="streaming-matrix-app-label">
          <input type="checkbox" class="streaming-matrix-checkbox" data-package="${esc(app.package)}"
            ${checked ? "checked" : ""} ${streamingMatrixBusy ? "disabled" : ""} />
          <span>${esc(app.label)}${app.custom ? ' <span class="streaming-tag streaming-tag--custom">Custom</span>' : ""}</span>
        </label>
      </td>${cells}</tr>`;
  }).join("");

  wrap.innerHTML = `<table class="streaming-matrix-table">
    <thead><tr><th class="matrix-app-col">App</th>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  const selectedCount = checkedSet.size;
  if (installBtn) {
    installBtn.disabled = streamingMatrixBusy || selectedCount === 0 || !devices.some(d => d.online);
    installBtn.textContent = streamingMatrixBusy ? "Installing…" : `Install on all TVs (${selectedCount})`;
  }
  if (matchBtn) {
    matchBtn.disabled = streamingMatrixBusy || !matrix.source_device_id || !devices.some(d => d.online && !d.is_source);
  }
}

async function loadStreamingMatrix() {
  const wrap = document.getElementById("streamingMatrixWrap");
  const note = document.getElementById("streamingMatrixNote");
  if (!wrap) return;
  if (!streamingMatrixBusy) {
    wrap.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; padding:1rem;">Loading install matrix…</p>';
  }
  try {
    const matrix = await api(`/registry/streaming-apps/matrix?property_id=${activePropertyId}`, {
      timeout: API_LONG_TIMEOUT_MS,
    });
    streamingMatrixSelected = null;
    renderStreamingMatrix(matrix);
    if (note && !streamingMatrixBusy) note.textContent = "";
  } catch (e) {
    if (wrap) wrap.innerHTML = `<p style="color:var(--danger); padding:1rem;">${esc(e.message)}</p>`;
    if (note) note.textContent = "";
  }
}

function setAllMatrixApps(checked) {
  const apps = streamingMatrixData?.apps || [];
  streamingMatrixSelected = checked ? apps.map(a => a.package) : [];
  if (streamingMatrixData) renderStreamingMatrix(streamingMatrixData);
}

function markMatrixSelectionDirty() {
  streamingMatrixSelected = getCheckedMatrixPackages();
  if (streamingMatrixData) renderStreamingMatrix(streamingMatrixData);
}

async function installMatrixBatch({ matchSource = false } = {}) {
  if (streamingMatrixBusy) return;
  const packages = streamingMatrixSelected || getCheckedMatrixPackages();
  const onlineCount = (streamingMatrixData?.devices || []).filter(d => d.online).length;

  if (matchSource) {
    const sourceName = streamingMatrixData?.source_device_name || "Main TV";
    if (!confirm(`Install all apps from ${sourceName} on every other online TV?\n\nOffline TVs will be skipped.`)) return;
  } else {
    if (!packages.length) {
      toast("Select at least one app to install", "error");
      return;
    }
    if (!onlineCount) {
      toast("No TVs online", "error");
      return;
    }
    if (!confirm(`Install ${packages.length} app(s) on all ${onlineCount} online TV(s) via ADB?\n\nAPKs are pulled from the source TV and installed the same way as the guest welcome app.`)) return;
  }

  streamingMatrixBusy = true;
  const note = document.getElementById("streamingMatrixNote");
  if (note) note.textContent = matchSource ? "Matching Main TV on all TVs…" : `Installing on ${onlineCount} TV(s)…`;
  hubLog({
    level: "info",
    category: "install",
    message: matchSource ? "Match Main TV install started" : `Batch install started (${packages.length} app(s) on ${onlineCount} TV(s))`,
  });
  renderStreamingInstallLog(null);
  if (streamingMatrixData) renderStreamingMatrix(streamingMatrixData);

  try {
    const body = matchSource
      ? { match_source: true, property_id: activePropertyId }
      : { packages, device_ids: "all", property_id: activePropertyId };
    const r = await api("/registry/streaming-apps/install-batch", {
      method: "POST",
      body,
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    renderStreamingInstallLog(r.install_report, matchSource ? "Match Main TV" : "Batch install");
    hubLogOperationResponse(matchSource ? "Match Main TV" : "Batch install", r, { category: "install" });
    if (note) note.textContent = r.message || "";
    toast(r.message || "Batch install complete", r.ok ? "success" : "error");
    await loadStreamingMatrix();
    if (selectedDevice && isDeviceOnline()) await loadStreamingApps();
    loadGuestSummary();
  } catch (e) {
    toast(e.message, "error");
    if (note) note.textContent = e.message;
    await loadStreamingMatrix();
  } finally {
    streamingMatrixBusy = false;
  }
}

async function scanStreamingStandard() {
  if (streamingMatrixBusy) return;
  const sourceName = streamingMatrixData?.source_device_name || "Main TV";
  if (!confirm(
    `Scan ${sourceName} for installed streaming apps and set that as the property standard?\n\n`
    + "This updates the allowed app list on all property TVs. Apps not on Main TV (e.g. BritBox, NBA) will be removed from the allow-list.\n\n"
    + "Installed apps are not uninstalled — use Clear streaming logins to sign out between stays.",
  )) return;

  streamingMatrixBusy = true;
  const note = document.getElementById("streamingMatrixNote");
  if (note) note.textContent = `Scanning ${sourceName}…`;
  hubLog({ level: "info", category: "install", message: `Scanning ${sourceName} for streaming standard` });

  try {
    const r = await api("/registry/streaming-apps/scan-standard", {
      method: "POST",
      body: { property_id: activePropertyId, propagate_allow_list: true },
      timeout: API_LONG_TIMEOUT_MS,
    });
    const extras = (r.scan?.extras_on_device || []).map(e => e.package);
    let detail = r.message || `Set ${r.package_count || 0} app(s) as standard`;
    if (extras.length) {
      detail += `. Extra packages on Main TV (not in catalog): ${extras.join(", ")}`;
    }
    if (note) note.textContent = detail;
    hubLogOperationResponse(`Scan ${sourceName} standard`, r, { category: "install" });
    toast(detail, r.ok ? "success" : "error");
    streamingMatrixSelected = null;
    await loadStreamingMatrix();
    if (selectedDevice && isDeviceOnline()) await loadStreamingApps();
    loadGuestSummary();
  } catch (e) {
    toast(e.message, "error");
    if (note) note.textContent = e.message;
    hubLog({ level: "error", category: "install", message: `Scan standard failed: ${e.message}` });
  } finally {
    streamingMatrixBusy = false;
  }
}

function streamingAppStatus(app, hasGuestAccount) {
  if (!app.hub_enabled) return { cls: "off", text: "Not allowed" };
  if (!app.owner?.enabled) return { cls: "warn", text: "Needs install" };
  if (!hasGuestAccount) return { cls: "warn", text: "Sign in guest account" };
  return { cls: "ok", text: "Ready" };
}

function getCheckedStreamingPackages() {
  return [...document.querySelectorAll(".streaming-app-checkbox:checked")]
    .map(el => el.dataset.package)
    .filter(Boolean);
}

function renderStreamingApps(catalog) {
  streamingCatalog = catalog;
  const list = document.getElementById("streamingAppsList");
  const note = document.getElementById("streamingAppsNote");
  const applyBtn = document.getElementById("btnStreamingApply");
  const installBtn = document.getElementById("btnStreamingInstallAll");
  if (!list) return;

  const apps = catalog?.apps || [];
  const hasGuestAccount = catalog?.has_guest_account ?? catalog?.has_guest_profile;
  const checkedSet = new Set(
    streamingPendingPackages || apps.filter(a => a.hub_enabled).map(a => a.package),
  );

  list.innerHTML = apps.map(app => {
    const checked = checkedSet.has(app.package);
    const status = checked
      ? streamingAppStatus({ ...app, hub_enabled: true }, hasGuestAccount)
      : { cls: "off", text: "Not allowed" };
    return `<label class="streaming-app-row">
      <input type="checkbox" class="streaming-app-checkbox" data-package="${esc(app.package)}"
        ${checked ? "checked" : ""} ${streamingAppsBusy ? "disabled" : ""} />
      <span class="streaming-app-label">${esc(app.label)}${app.custom ? ' <span class="streaming-tag streaming-tag--custom">Custom</span>' : ""}</span>
      <span class="streaming-app-status ${status.cls}">${esc(status.text)}</span>
    </label>`;
  }).join("");

  const selectedCount = checkedSet.size;
  if (note) {
    let text = `${selectedCount} of ${apps.length} app(s) allowed for guests.`;
    if (hasGuestAccount) {
      text += " Apps install on the main profile via ADB (APKs from source TV). Click Apply to sync.";
    } else {
      text += ` Sign in with ${activeGuestAccountEmail()} on the TV, then Apply again.`;
    }
    note.textContent = text;
  }
  if (applyBtn) {
    applyBtn.disabled = streamingAppsBusy || !isDeviceOnline();
    applyBtn.textContent = streamingPendingPackages ? `Apply (${selectedCount})` : "Apply to TV";
  }
  if (installBtn) {
    installBtn.disabled = streamingAppsBusy || !isDeviceOnline() || selectedCount === 0;
    installBtn.textContent = streamingAppsBusy ? "Installing…" : `Install all (${selectedCount})`;
  }
}

function markStreamingSelectionDirty() {
  streamingPendingPackages = getCheckedStreamingPackages();
  if (streamingCatalog) renderStreamingApps(streamingCatalog);
}

async function loadStreamingApps() {
  if (!selectedDevice || !isDeviceOnline()) return;
  const list = document.getElementById("streamingAppsList");
  const note = document.getElementById("streamingAppsNote");
  streamingPendingPackages = null;
  if (list) list.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">Loading streaming apps...</span>';
  try {
    const catalog = await api(`/registry/${selectedDevice.id}/streaming-apps`, { timeout: API_LONG_TIMEOUT_MS });
    renderStreamingApps(catalog);
  } catch (e) {
    if (list) list.innerHTML = `<span style="color:var(--danger); font-size:0.85rem;">${esc(e.message)}</span>`;
    if (note) note.textContent = "";
  }
}

async function applyStreamingAllowList() {
  if (!selectedDevice || !isDeviceOnline() || streamingAppsBusy) return;
  const packages = getCheckedStreamingPackages();
  streamingAppsBusy = true;
  streamingPendingPackages = packages;
  if (streamingCatalog) renderStreamingApps(streamingCatalog);
  hubLog({
    level: "info",
    category: "install",
    message: `Apply streaming allow-list on ${selectedDevice.name} (${packages.length} app(s))`,
    deviceName: selectedDevice.name,
    deviceId: selectedDevice.id,
  });

  try {
    const r = await api(`/registry/${selectedDevice.id}/streaming-apps`, {
      method: "PUT",
      body: { packages },
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    renderStreamingInstallLog(r.install_report, `Apply to ${selectedDevice.name}`);
    hubLogOperationResponse(`Apply streaming allow-list`, r, {
      category: "install",
      deviceName: selectedDevice.name,
      deviceId: selectedDevice.id,
    });
    streamingPendingPackages = null;
    if (r.catalog) renderStreamingApps(r.catalog);
    else await loadStreamingApps();
    toast(r.message || (r.ok ? "Allow-list applied" : "Some apps failed"), r.ok ? "success" : "error");
    loadGuestSummary();
  } catch (e) {
    toast(e.message, "error");
    await loadStreamingApps();
  } finally {
    streamingAppsBusy = false;
  }
}

function setAllStreamingApps(checked) {
  const apps = streamingCatalog?.apps || [];
  streamingPendingPackages = checked ? apps.map(a => a.package) : [];
  if (streamingCatalog) renderStreamingApps(streamingCatalog);
}

async function installAllStreamingApps() {
  if (!selectedDevice || !isDeviceOnline() || streamingAppsBusy) {
    toast(selectedDevice ? "TV not connected" : "Select a TV first", "error");
    return;
  }
  const packages = streamingPendingPackages || getCheckedStreamingPackages();
  if (!packages.length) {
    toast("Select at least one app to install", "error");
    return;
  }
  if (!confirm(`Install ${packages.length} streaming app(s) on ${selectedDevice.name} via ADB?\n\nAPKs are pulled from the source TV when needed, using the same adb install flow as the guest welcome app.`)) return;

  streamingAppsBusy = true;
  const note = document.getElementById("streamingAppsNote");
  if (note) note.textContent = `Installing 0 of ${packages.length}…`;
  hubLog({
    level: "info",
    category: "install",
    message: `Install started on ${selectedDevice.name} (${packages.length} app(s))`,
    deviceName: selectedDevice.name,
    deviceId: selectedDevice.id,
  });
  renderStreamingInstallLog(null);
  if (streamingCatalog) renderStreamingApps(streamingCatalog);

  try {
    const r = await api(`/registry/${selectedDevice.id}/streaming-apps/install`, {
      method: "POST",
      body: { packages },
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    renderStreamingInstallLog(r.install_report, `Install on ${selectedDevice.name}`);
    hubLogOperationResponse(`Install streaming apps`, r, {
      category: "install",
      deviceName: selectedDevice.name,
      deviceId: selectedDevice.id,
    });
    if (r.catalog) renderStreamingApps(r.catalog);
    else await loadStreamingApps();
    const failed = (r.results || []).filter(x => !x.ok);
    toast(
      r.message || `Installed ${r.installed || 0} of ${r.total || packages.length}`,
      failed.length ? "error" : "success",
    );
    loadGuestSummary();
  } catch (e) {
    toast(e.message, "error");
    await loadStreamingApps();
  } finally {
    streamingAppsBusy = false;
  }
}

function renderGuestStatus(status) {
  const panel = document.getElementById("guestStatusPanel");
  if (!panel) return;
  const guest = status.guest_account || status.guest_profile || {};
  const workflow = (status.setup_workflow || []).map(x => `<li>${esc(x)}</li>`).join("");
  const profiles = (status.profiles || []).map(p => `
    <div class="lockdown-step ${p.is_current ? "pass" : ""}">
      <div class="lockdown-step-icon">${p.is_main ? "M" : "?"}</div>
      <div>
        <div class="lockdown-step-title">${esc(p.name || `User ${p.id}`)} (id ${p.id})</div>
        <div class="lockdown-step-desc">${esc(p.type || "unknown type")}${p.is_current ? " · current" : ""}${p.is_main ? " · main profile" : ""}</div>
        ${p.google_accounts?.length ? `<div class="lockdown-step-desc">Accounts: ${esc(p.google_accounts.join(", "))}</div>` : ""}
      </div>
    </div>`).join("");

  panel.innerHTML = `
    <div class="info-item" style="margin-bottom:1rem;">
      <div class="label">Guest Google account (main profile)</div>
      <div class="value" style="font-size:0.85rem;">${guest.configured
    ? `${esc(guest.accounts?.[0] || status.guest_google_account)}`
    : `Not configured — sign in with ${esc(status.guest_google_account || activeGuestAccountEmail())} on the TV`}</div>
    </div>
    <div class="streaming-apps-section">
      <div class="section-title">Allowed streaming apps</div>
      <p class="field-hint">Checked apps are installed on the main profile and listed on the TV welcome screen. Unchecked apps are hidden. Changes apply only after you click <strong>Apply to TV</strong> on the selected TV (or use Mirror from a source TV).</p>
      <div class="streaming-apps-toolbar">
        <button type="button" class="btn btn-secondary btn-sm" id="btnStreamingSelectAll">Select all</button>
        <button type="button" class="btn btn-secondary btn-sm" id="btnStreamingClearAll">Clear all</button>
        <button type="button" class="btn btn-secondary btn-sm" id="btnStreamingInstallAll" title="Install checked apps via ADB on the selected TV">Install all</button>
        <button type="button" class="btn btn-primary btn-sm" id="btnStreamingApply">Apply to TV</button>
      </div>
      <div class="streaming-apps-list" id="streamingAppsList"></div>
      <div class="streaming-apps-note" id="streamingAppsNote"></div>
    </div>
    <div class="section-title">TV setup workflow</div>
    <ol style="font-size:0.85rem; line-height:1.6; margin:0.5rem 0 1rem 1.25rem;">${workflow}</ol>
    <div class="section-title">Profiles on TV</div>
    ${profiles || '<p style="color:var(--text-muted); padding:1rem;">No users found.</p>'}`;
}

async function loadGuestStatus() {
  if (!selectedDevice || !isDeviceOnline()) return;
  const panel = document.getElementById("guestStatusPanel");
  if (panel) panel.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">Loading...</p>';
  try {
    const status = await api(`/registry/${selectedDevice.id}/guest-status`);
    renderGuestStatus(status);
    await loadStreamingApps();
    loadStreamingMirrorBanner();
    await loadStreamingMatrix();
    await loadGuestWelcome();
    await loadGuestExperience();
    loadGuestSummary();
  } catch (e) {
    if (panel) panel.innerHTML = `<p style="color:var(--danger); padding:1rem;">${esc(e.message)}</p>`;
  }
}

async function clearStreamingLogins() {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  if (!isDeviceOnline()) { toast("TV not connected", "error"); return; }
  if (!confirm("Clear streaming app sign-ins on this TV?\n\nNetflix, Disney+, Plex, Paramount+, etc. will need to be signed in again.")) return;
  hubLog({
    level: "info",
    category: "guest",
    message: "Clear streaming logins started",
    deviceName: selectedDevice.name,
    deviceId: selectedDevice.id,
  });
  try {
    const r = await api(`/registry/${selectedDevice.id}/clear-streaming-logins`, {
      method: "POST",
      timeout: API_LONG_TIMEOUT_MS,
    });
    hubLogOperationResponse("Clear streaming logins", r, {
      category: "guest",
      deviceName: selectedDevice.name,
      deviceId: selectedDevice.id,
    });
    toast(r.ok ? `Cleared ${r.cleared?.length || 0} app(s)` : "Some apps failed to clear", r.ok ? "success" : "error");
    loadGuestSummary();
  } catch (e) {
    hubLog({
      level: "error",
      category: "guest",
      message: `Clear streaming logins failed: ${e.message}`,
      deviceName: selectedDevice.name,
      deviceId: selectedDevice.id,
    });
    toast(e.message, "error");
  }
}

async function clearStreamingLoginsAll() {
  if (!confirm("Clear streaming app sign-ins on all connected property TVs?\n\nGuests will need to sign in again on each streaming app.")) return;
  hubLog({ level: "info", category: "guest", message: "Clear streaming logins on all TVs started" });
  try {
    const r = await api("/registry/clear-streaming-logins-all", {
      method: "POST",
      timeout: API_MIRROR_TIMEOUT_MS,
    });
    hubLogOperationResponse("Clear streaming logins (all TVs)", r, { category: "guest" });
    toast(r.message || "Clear complete", r.ok ? "success" : "error");
    loadGuestSummary();
  } catch (e) {
    hubLog({ level: "error", category: "guest", message: `Clear all failed: ${e.message}` });
    toast(e.message, "error");
  }
}

async function loadOverview() {
  const s = serial();
  if (!s) return;
  const online = isDeviceOnline();
  if (online) {
    document.getElementById("infoGrid").innerHTML =
      '<p style="color:var(--text-muted);">Loading device info...</p>';
  }
  try {
    const info = await api(`/devices/${enc(s)}/info`, { timeout: 20000 });
    const profile = deviceProfile(selectedDevice);
    const fields = {
      Type: profile.device_type_label || deviceTypeLabel(selectedDevice),
      Model: info.product_model || profile.product_model,
      Manufacturer: info.product_manufacturer || profile.product_manufacturer,
      Device: info.product_device || profile.product_device,
      Brand: info.product_brand, Android: info.build_version_release,
      "API Level": info.api_level, SDK: info.build_version_sdk,
      Serial: info.serialno || s, State: info.state,
      "Wireless Mode": info.wireless_mode || "—",
      Battery: info.battery_level ? `${info.battery_level}%` : "—",
      Screen: info.screen_size || "—",
    };
    document.getElementById("infoGrid").innerHTML = Object.entries(fields).map(([k, v]) =>
      `<div class="info-item"><div class="label">${k}</div><div class="value">${esc(String(v || "—"))}</div></div>`
    ).join("");
  } catch {
    if (online) {
      document.getElementById("infoGrid").innerHTML =
        '<p style="color:var(--warning);">ADB connected but device details are slow to load.</p>';
    } else {
      document.getElementById("infoGrid").innerHTML =
        '<p style="color:var(--danger);">Device offline. Click Connect or Pair.</p>';
    }
  }
}

// Tabs
document.getElementById("tabs").addEventListener("click", e => {
  if (!e.target.classList.contains("tab")) return;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll("#devicePanel .panel").forEach(p => p.classList.remove("active"));
  e.target.classList.add("active");
  document.getElementById(`panel-${e.target.dataset.tab}`).classList.add("active");
});

document.querySelectorAll(".main-nav-link[data-view]").forEach(btn => {
  btn.addEventListener("click", () => showHubView(btn.dataset.view));
});

document.getElementById("navSetupToggle")?.addEventListener("click", e => {
  e.stopPropagation();
  if (activeHubView !== "setup") showHubView("setup");
  toggleSetupDropdown();
});

document.querySelectorAll(".setup-subnav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    navigateSetup(btn.dataset.setupSection);
  });
});

document.addEventListener("click", e => {
  const dropdown = document.getElementById("navSetupDropdown");
  if (dropdown && !dropdown.contains(e.target)) closeSetupDropdown();
});

document.getElementById("btnSetupRoomCopy")?.addEventListener("click", async () => {
  const code = document.getElementById("setupRoomDetailCode")?.textContent?.trim();
  if (!code || code === "—") return;
  try {
    await navigator.clipboard.writeText(code);
    toast("Room code copied", "success");
  } catch (_) {
    toast("Copy failed", "error");
  }
});

document.getElementById("btnSetupRoomRegen")?.addEventListener("click", async () => {
  if (!setupSelectedDeviceId) return;
  await regenerateRoomCode(setupSelectedDeviceId);
});

document.getElementById("setupRoomDashboardMode")?.addEventListener("change", e => {
  const wrap = document.getElementById("setupRoomHaUrlWrap");
  if (wrap) wrap.hidden = e.target.value !== "ha_dashboard";
  if (setupRoomConfigDraft) setupRoomConfigDraft.dashboard_mode = e.target.value;
});

document.getElementById("btnSetupRoomAddEntity")?.addEventListener("click", () => {
  const pick = document.getElementById("setupRoomEntityPick");
  const entityId = pick?.value?.trim();
  if (!entityId) return;
  const entity = (setupHaEntitiesCache || []).find(e => e.entity_id === entityId);
  if (addSetupRoomControl(entityId, entity?.label)) {
    if (pick) pick.value = "";
  }
});

document.getElementById("btnSetupRoomAddEntityManual")?.addEventListener("click", () => {
  const input = document.getElementById("setupRoomEntityManual");
  const entityId = input?.value?.trim();
  if (!entityId) return;
  if (addSetupRoomControl(entityId, entityId)) {
    input.value = "";
  }
});

document.getElementById("btnSetupRoomSaveExperience")?.addEventListener("click", () => {
  saveSetupRoomExperience();
});

document.getElementById("setupPropertySelect")?.addEventListener("change", e => {
  setActiveProperty(e.target.value);
});
document.getElementById("guestPropertySelect")?.addEventListener("change", e => {
  setActiveProperty(e.target.value);
});
document.getElementById("btnSetupRefresh")?.addEventListener("click", () => loadSetupStatus());
document.getElementById("btnGuestExperienceOpenSetup")?.addEventListener("click", () => navigateSetup("property"));
document.getElementById("setupHaForm")?.addEventListener("submit", saveSetupHaConfig);
document.getElementById("btnSetupHaTest")?.addEventListener("click", testSetupHaConnection);
document.getElementById("btnSetupAppSlot")?.addEventListener("click", () => openModal("appSlotModal"));
document.getElementById("btnCancelAppSlot")?.addEventListener("click", () => closeModal("appSlotModal"));
document.getElementById("appSlotForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = fd.get("name")?.toString().trim();
  const notes = fd.get("notes")?.toString().trim();
  if (!name) return;
  try {
    const res = await api("/aatomhome/registry/app-slot", {
      method: "POST",
      body: { name, notes: notes || undefined, property_id: activePropertyId },
    });
    closeModal("appSlotModal");
    e.target.reset();
    await loadRegistry();
    await loadSetupStatus();
    if (res.device_id) {
      navigateSetup("rooms", res.device_id);
      const panel = document.getElementById("setupRoomCodePanel");
      const codeEl = document.getElementById("setupRoomCodeValue");
      const devEl = document.getElementById("setupRoomCodeDevice");
      if (devEl) devEl.textContent = name;
      if (codeEl) codeEl.textContent = res.claim_code || "—";
      if (panel) panel.hidden = false;
    }
    toast(res.message || "Room slot created", "success");
  } catch (err) {
    toast(err.message || "Could not create room slot", "error");
  }
});
document.getElementById("btnSetupAddTv")?.addEventListener("click", () => openModal("addModal"));
document.getElementById("btnSetupPairTv")?.addEventListener("click", () => document.getElementById("btnQuickPair")?.click());
document.getElementById("btnSetupGoTvs")?.addEventListener("click", () => showHubView("devices"));
document.getElementById("btnSetupAddProperty")?.addEventListener("click", () => openModal("addPropertyModal"));
document.getElementById("btnCancelAddProperty")?.addEventListener("click", () => closeModal("addPropertyModal"));
document.getElementById("addPropertyForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = fd.get("name")?.toString().trim();
  const propertyLink = fd.get("property_link")?.toString().trim();
  const guestAccount = fd.get("guest_google_account")?.toString().trim() || "";
  if (!name || !propertyLink) return;
  try {
    const res = await api("/aatomhome/properties", {
      method: "POST",
      body: { name, property_link: propertyLink, guest_google_account: guestAccount },
    });
    closeModal("addPropertyModal");
    e.target.reset();
    activePropertyId = res.property_id || res.active_property_id || activePropertyId;
    await loadSetupStatus();
    toast(`Property “${name}” created`, "success");
  } catch (err) {
    toast(err.message || "Could not create property", "error");
  }
});
document.getElementById("setupGuestAccountForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("setupGuestAccount")?.value?.trim() || "";
  await savePropertyGuestAccount(email);
});
document.getElementById("setupPropertyLinkForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const link = document.getElementById("setupPropertyLink")?.value?.trim();
  if (!link) {
    toast("Property link is required", "error");
    return;
  }
  try {
    const res = await api(`/aatomhome/properties/${activePropertyId}/property-link`, {
      method: "PUT",
      body: { property_link: link },
    });
    const idx = hubProperties.findIndex(p => p.id === activePropertyId);
    if (idx >= 0) hubProperties[idx].property_link = res.property_link;
    syncPropertyAccountFields();
    toast("Property link saved", "success");
  } catch (err) {
    toast(err.message || "Save failed", "error");
  }
});
async function geocodePropertyAddressFromForm({ silent = false } = {}) {
  const address = document.getElementById("setupPropertyAddress")?.value?.trim() || "";
  const status = document.getElementById("setupPropertyLocationStatus");
  if (!address || propertyCoordsManual) return false;
  if (status) {
    status.textContent = "Looking up coordinates…";
    status.className = "setup-room-save-status";
  }
  try {
    const res = await api(`/aatomhome/geocode?address=${encodeURIComponent(address)}`);
    const latEl = document.getElementById("setupWeatherLat");
    const lonEl = document.getElementById("setupWeatherLon");
    const labelEl = document.getElementById("setupWeatherLocation");
    if (latEl && res.lat != null) latEl.value = String(res.lat);
    if (lonEl && res.lon != null) lonEl.value = String(res.lon);
    if (labelEl && res.label && !labelEl.value.trim()) labelEl.value = res.label;
    propertyCoordsManual = false;
    updateCoordsHint();
    if (status) {
      status.textContent = res.matched_address ? `Located: ${res.matched_address}` : "Coordinates updated from address";
      status.className = "setup-room-save-status ok";
    }
    if (!silent) toast("Coordinates set from address", "success");
    return true;
  } catch (err) {
    if (status) {
      status.textContent = err.message || "Geocode failed";
      status.className = "setup-room-save-status err";
    }
    if (!silent) toast(err.message || "Could not geocode address", "error");
    return false;
  }
}

document.getElementById("setupPropertyAddress")?.addEventListener("blur", () => {
  void geocodePropertyAddressFromForm({ silent: true });
});

document.getElementById("setupWeatherLat")?.addEventListener("input", () => {
  propertyCoordsManual = true;
  updateCoordsHint();
});
document.getElementById("setupWeatherLon")?.addEventListener("input", () => {
  propertyCoordsManual = true;
  updateCoordsHint();
});

document.getElementById("setupPropertyLocationForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!propertyCoordsManual) {
    await geocodePropertyAddressFromForm({ silent: true });
  }
  await savePropertyLocation(collectPropertyLocationForm());
});
document.getElementById("btnSetupRoomCode")?.addEventListener("click", async () => {
  if (!setupSelectedDeviceId) {
    toast("Select a registered TV in the list first", "error");
    return;
  }
  try {
    const res = await api(`/registry/${setupSelectedDeviceId}/prepare-claim`, { method: "POST" });
    const panel = document.getElementById("setupRoomCodePanel");
    const codeEl = document.getElementById("setupRoomCodeValue");
    const devEl = document.getElementById("setupRoomCodeDevice");
    const device = (registry || []).find(d => d.id === setupSelectedDeviceId);
    if (devEl) devEl.textContent = device?.name || `TV #${setupSelectedDeviceId}`;
    if (codeEl) codeEl.textContent = res.claim_code || "—";
    if (panel) panel.hidden = false;
    toast("Room code ready — enter on TV launcher app", "success");
  } catch (err) {
    toast(err.message || "Could not generate room code", "error");
  }
});
document.getElementById("setupPropertyForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("setupPropertyName")?.value?.trim();
  if (!name) return;
  try {
    await api("/aatomhome/setup/property", { method: "PUT", body: { property_name: name } });
    toast("Property name saved", "success");
    await loadSetupStatus();
  } catch (err) {
    toast(err.message || "Save failed", "error");
  }
});
document.querySelectorAll(".setup-copy").forEach(btn => {
  btn.addEventListener("click", async () => {
    const target = document.getElementById(btn.dataset.copyTarget);
    const text = target?.textContent?.trim();
    if (!text || text === "—") {
      toast("Nothing to copy", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard", "success");
    } catch {
      toast("Copy failed", "error");
    }
  });
});

const guestExperienceRoot = document.getElementById("guestExperienceView");
if (guestExperienceRoot) {
  guestExperienceRoot.addEventListener("click", e => {
    const id = e.target?.id;
    if (id === "btnStreamingSelectAll") setAllStreamingApps(true);
    else if (id === "btnStreamingClearAll") setAllStreamingApps(false);
    else if (id === "btnStreamingInstallAll") installAllStreamingApps();
    else if (id === "btnStreamingApply") applyStreamingAllowList();
    else if (id === "btnMatrixSelectAll") setAllMatrixApps(true);
    else if (id === "btnMatrixClearAll") setAllMatrixApps(false);
    else if (id === "btnMatrixInstallAll") installMatrixBatch();
    else if (id === "btnMatrixMatchSource") installMatrixBatch({ matchSource: true });
    else if (id === "btnMatrixScanStandard") scanStreamingStandard();
    else if (id === "btnMatrixRefresh") loadStreamingMatrix();
    else if (e.target.classList.contains("streaming-catalog-remove")) {
      removeCustomStreamingApp(e.target.dataset.package);
    }
  });
  document.getElementById("customStreamingAppForm")?.addEventListener("submit", addCustomStreamingApp);
  guestExperienceRoot.addEventListener("change", e => {
    if (e.target.classList.contains("streaming-app-checkbox")) markStreamingSelectionDirty();
    if (e.target.classList.contains("streaming-matrix-checkbox")) markMatrixSelectionDirty();
  });
}

// Modals
function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

document.getElementById("btnAddDevice").addEventListener("click", () => openModal("addModal"));
document.getElementById("btnCancelAdd").addEventListener("click", () => closeModal("addModal"));
document.getElementById("btnQuickPair").addEventListener("click", async () => {
  openModal("pairModal");
  const hint = document.getElementById("mdnsHint");
  try {
    const data = await api("/adb/mdns");
    const services = data.services || data;
    if (!services.length) {
      hint.textContent = "No TVs found via mDNS — enter IP from the TV’s Wireless debugging screen.";
      return;
    }
    const tls = services.filter(s => s.is_tls);
    const pairing = services.filter(s => (s.service_type || "").includes("pairing"));
    const host = (tls[0] || services[0]).host;
    const form = document.getElementById("pairForm");
    if (host && form.host && !form.host.value) form.host.value = host;
    hint.textContent = [
      tls.length ? `Connect: ${tls.map(s => `${s.host}:${s.port}`).join(", ")}` : null,
      pairing.length ? `Pairing: ${pairing.map(s => `${s.host}:${s.port}`).join(", ")}` : null,
    ].filter(Boolean).join(" · ") || `Found: ${services.map(s => `${s.host}:${s.port}`).join(", ")}`;
  } catch {
    hint.textContent = "";
  }
});
document.getElementById("btnCancelPair").addEventListener("click", () => closeModal("pairModal"));

document.getElementById("btnPair").addEventListener("click", () => {
  if (!selectedDevice) return;
  const form = document.getElementById("pairForm");
  form.host.value = selectedDevice.host;
  form.pairing_port.value = selectedDevice.pairing_port || "";
  form.connect_port.value = selectedDevice.port || 5555;
  openModal("pairModal");
});

function openPairModalForSelected() {
  document.getElementById("btnPair")?.click();
}

async function connectSelectedDevice() {
  document.getElementById("btnConnect")?.click();
}

async function discoverSelectedDevice() {
  document.getElementById("btnDiscover")?.click();
}

document.getElementById("btnGuestPair")?.addEventListener("click", () => {
  if (!selectedDevice) { toast("Select a TV in the sidebar first", "error"); return; }
  openPairModalForSelected();
});
document.getElementById("btnGuestConnect")?.addEventListener("click", () => {
  if (!selectedDevice) { toast("Select a TV in the sidebar first", "error"); return; }
  connectSelectedDevice();
});
document.getElementById("btnGuestDiscover")?.addEventListener("click", () => {
  if (!selectedDevice) { toast("Select a TV in the sidebar first", "error"); return; }
  discoverSelectedDevice();
});
document.getElementById("btnGuestDevTools")?.addEventListener("click", () => {
  if (!selectedDevice) { toast("Select a TV in the sidebar first", "error"); return; }
  if (selectedDevice.connection_state === "unauthorized") {
    toast("Pair or allow wireless debugging on the TV first — dev tools need full ADB access", "error");
    openPairModalForSelected();
    return;
  }
  if (!isDeviceOnline()) { toast(deviceConnectionBlockedMessage(), "error"); return; }
  showHubView("devices");
  initializeDevicePanel();
});

document.getElementById("addForm").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  body.port = parseInt(body.port) || 5555;
  if (body.port === 5555 && !fd.get("port")) body.port = 5555;
  if (body.pairing_port) body.pairing_port = parseInt(body.pairing_port);
  else delete body.pairing_port;
  if (!body.pairing_code) delete body.pairing_code;
  if (!body.notes) delete body.notes;
  try {
    const result = await api("/registry", { method: "POST", body: JSON.stringify(body) });
    const msg = (result.messages || []).join("; ");
    toast(msg || "Registered");
    closeModal("addModal");
    e.target.reset();
    await loadRegistry();
    if (result.device) selectDevice(result.device.id);
  } catch (err) { toast(err.message, "error"); }
});

document.getElementById("pairForm").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const host = fd.get("host");
  const pairing_port = parseInt(fd.get("pairing_port"));
  const code = fd.get("code");
  const connect_port = parseInt(fd.get("connect_port")) || null;
  try {
    const qs = connect_port && connect_port !== 5555 ? `?connect_port=${connect_port}` : "";
    const pair = await api(`/devices/pair${qs}`, {
      method: "POST",
      body: JSON.stringify({ host, pairing_port, code }),
    });
    const msg = [(pair.messages || [pair.message]).join("; "), pair.hint].filter(Boolean).join(" ");
    toast(msg, pair.ok ? "success" : "error");
    if (!pair.ok) return;
    closeModal("pairModal");
    await loadRegistry();
    if (selectedDevice) selectDevice(selectedDevice.id);
  } catch (err) { toast(err.message, "error"); }
});

// Device actions
document.getElementById("btnConnectAll")?.addEventListener("click", () => connectAllTvs());
document.getElementById("btnConnectAllPanel")?.addEventListener("click", () => connectAllTvs());
document.getElementById("btnGuestConnectAll")?.addEventListener("click", () => connectAllTvs());

document.getElementById("btnConnect").addEventListener("click", async () => {
  if (!selectedDevice) return;
  try {
    const r = await api(`/registry/${selectedDevice.id}/connect`, { method: "POST", timeout: API_LONG_TIMEOUT_MS });
    toast(r.message);
    await loadRegistry();
    selectDevice(selectedDevice.id);
  } catch (e) { toast(e.message, "error"); }
});

document.getElementById("btnDiscover").addEventListener("click", async () => {
  if (!selectedDevice) return;
  try {
    const r = await api(`/registry/${selectedDevice.id}/discover`, { method: "POST" });
    toast(`Discovered port ${r.port}: ${r.message}`);
    await loadRegistry();
    selectDevice(selectedDevice.id);
  } catch (e) { toast(e.message, "error"); }
});

document.getElementById("btnRefresh").addEventListener("click", async () => {
  await loadRegistry();
  if (selectedDevice) selectDevice(selectedDevice.id);
});

document.getElementById("btnDelete").addEventListener("click", async () => {
  if (!selectedDevice || !confirm(`Remove ${selectedDevice.name}?`)) return;
  await api(`/registry/${selectedDevice.id}`, { method: "DELETE" });
  selectedDevice = null;
  document.getElementById("devicePanel").style.display = "none";
  document.getElementById("emptyState").style.display = "block";
  updateTvActionsBar();
  await loadRegistry();
  toast("Removed");
});

// Server controls
document.getElementById("btnServerStart").addEventListener("click", async () => {
  const r = await api("/server/start", { method: "POST" });
  document.getElementById("serverOutput").textContent = r.message;
});
document.getElementById("btnServerKill").addEventListener("click", async () => {
  const r = await api("/server/kill", { method: "POST" });
  document.getElementById("serverOutput").textContent = r.message;
});
document.getElementById("btnMdns").addEventListener("click", async () => {
  const r = await api("/adb/mdns");
  const lines = (r.services || []).map(s =>
    `${s.host}:${s.port} ${s.is_tls ? "[TLS/Android 14]" : "[legacy]"} ${s.instance}`
  );
  document.getElementById("serverOutput").textContent =
    lines.length ? lines.join("\n") : "No devices discovered via mDNS";
});

document.getElementById("btnAdbAutoEnable").addEventListener("click", async () => {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  if (!isDeviceOnline()) { toast("TV not connected — Connect first", "error"); return; }
  const msg = [
    "Install adb-auto-enable on the Owner profile?",
    "",
    "1. On the TV (Owner): Developer options → Wireless debugging",
    "2. Tap Pair device with pairing code (leave screen open)",
    "3. Enter a fresh port + code below",
    "",
    "After reboot, wait ~60s then Discover → Connect.",
  ].join("\n");
  if (!confirm(msg)) return;
  const creds = await promptPairingCredentials();
  if (!creds) return;
  try {
    await runAdbAutoEnable(creds);
  } catch (e) { toast(e.message, "error"); }
});

document.getElementById("btnAdbAutoEnablePanel")?.addEventListener("click", () => {
  document.getElementById("btnAdbAutoEnable")?.click();
});

// Overview actions
document.querySelectorAll("[data-reboot]").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!confirm(`Reboot${btn.dataset.reboot ? " to " + btn.dataset.reboot : ""}?`)) return;
    const mode = btn.dataset.reboot || "";
    hubLogPowerAction("Reboot", selectedDevice, { mode, requested: true });
    const r = await api(`/devices/${enc(serial())}/reboot`, {
      method: "POST", body: JSON.stringify({ mode }),
    });
    hubLogPowerAction("Reboot", selectedDevice, { mode, requested: false, response: r });
    toast(r.message);
  });
});
document.getElementById("btnTcpip").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/tcpip?port=5555`, { method: "POST" });
  toast(r.message);
});
document.getElementById("btnBugreport").addEventListener("click", () => {
  window.open(`${API}/devices/${enc(serial())}/bugreport`);
  toast("Bugreport download started (may take a few minutes)");
});
document.getElementById("btnProps").addEventListener("click", async () => {
  const props = await api(`/devices/${enc(serial())}/props`);
  const el = document.getElementById("propsOutput");
  el.style.display = "block";
  el.textContent = Object.entries(props).map(([k, v]) => `[${k}]: ${v}`).join("\n");
});

// Shell
async function runShell() {
  const blocked = deviceConnectionBlockedMessage();
  if (blocked) { toast(blocked, "error"); return; }
  const cmd = document.getElementById("shellInput").value;
  if (!cmd) return;
  const r = await api(`/devices/${enc(serial())}/shell`, {
    method: "POST", body: JSON.stringify({ command: cmd }),
  });
  document.getElementById("shellOutput").textContent = r.stdout || r.stderr || "(empty)";
}
document.getElementById("btnShell").addEventListener("click", runShell);
document.getElementById("shellInput").addEventListener("keydown", e => {
  if (e.key === "Enter") runShell();
});

// Advanced
document.getElementById("btnRaw").addEventListener("click", async () => {
  const cmd = document.getElementById("rawInput").value;
  const r = await api(`/devices/${enc(serial())}/raw`, {
    method: "POST", body: JSON.stringify({ command: cmd }),
  });
  document.getElementById("advancedOutput").textContent = r.stdout || r.stderr || "(empty)";
});
document.getElementById("btnDumpsys").addEventListener("click", async () => {
  const service = document.getElementById("dumpsysInput").value;
  const r = await api(`/devices/${enc(serial())}/dumpsys`, {
    method: "POST", body: JSON.stringify({ service }),
  });
  document.getElementById("advancedOutput").textContent = r.output || "(empty)";
});
document.getElementById("btnStartActivity").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/activity`, {
    method: "POST", body: JSON.stringify({
      component: document.getElementById("actComponent").value,
      action: document.getElementById("actAction").value,
      data_uri: document.getElementById("actData").value,
    }),
  });
  document.getElementById("advancedOutput").textContent = r.message;
  toast(r.message, r.ok ? "success" : "error");
});

// Logcat
document.getElementById("btnLogcat").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/logcat`, {
    method: "POST", body: JSON.stringify({
      lines: parseInt(document.getElementById("logcatLines").value),
      filter: document.getElementById("logcatFilter").value,
    }),
  });
  document.getElementById("logcatOutput").textContent = r.log || "(empty)";
});
document.getElementById("btnClearLogcat").addEventListener("click", async () => {
  await api(`/devices/${enc(serial())}/logcat`, { method: "DELETE" });
  document.getElementById("logcatOutput").textContent = "Cleared";
});

// Screenshot
document.getElementById("btnScreenshot").addEventListener("click", async () => {
  const c = document.getElementById("screenshotContainer");
  c.innerHTML = "<p>Capturing...</p>";
  try {
    const res = await fetch(`${API}/devices/${enc(serial())}/screenshot`);
    if (!res.ok) throw new Error("failed");
    const url = URL.createObjectURL(await res.blob());
    c.innerHTML = `<img src="${url}" alt="screenshot" />`;
  } catch { c.innerHTML = "<p style='color:var(--danger)'>Failed</p>"; }
});

// Input
document.getElementById("btnSendText").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/input/text`, {
    method: "POST", body: JSON.stringify({ text: document.getElementById("inputText").value }),
  });
  toast(r.message);
});
document.getElementById("btnTap").addEventListener("click", async () => {
  await api(`/devices/${enc(serial())}/input/tap`, {
    method: "POST", body: JSON.stringify({
      x: parseInt(document.getElementById("tapX").value),
      y: parseInt(document.getElementById("tapY").value),
    }),
  });
  toast("Tap sent");
});
document.getElementById("btnSwipe").addEventListener("click", async () => {
  await api(`/devices/${enc(serial())}/input/swipe`, {
    method: "POST", body: JSON.stringify({
      x1: parseInt(document.getElementById("tapX").value) || 0,
      y1: parseInt(document.getElementById("tapY").value) || 0,
      x2: parseInt(document.getElementById("swipeX2").value) || 0,
      y2: parseInt(document.getElementById("swipeY2").value) || 0,
    }),
  });
  toast("Swipe sent");
});
const keyGrid = document.getElementById("keyGrid");
keyGrid.innerHTML = Object.entries(KEYCODES).map(([n, c]) =>
  `<button class="key-btn" data-key="${c}">${n}</button>`).join("");
keyGrid.addEventListener("click", async e => {
  if (!e.target.dataset.key) return;
  await api(`/devices/${enc(serial())}/input/keyevent`, {
    method: "POST", body: JSON.stringify({ keycode: parseInt(e.target.dataset.key) }),
  });
});

// Apps
async function listPackages(thirdParty) {
  const filter = document.getElementById("pkgFilter").value;
  let url = `/devices/${enc(serial())}/packages?third_party=${thirdParty}`;
  if (filter) url += `&filter=${enc(filter)}`;
  const pkgs = await api(url);
  const list = document.getElementById("pkgList");
  if (!pkgs.length) { list.innerHTML = "<p style='padding:1rem;color:var(--text-muted)'>None found</p>"; return; }
  list.innerHTML = pkgs.map(p => `
    <div class="pkg-item">
      <span>${esc(p)}</span>
      <div style="display:flex;gap:0.25rem;">
        <button class="btn btn-secondary btn-sm" data-stop="${esc(p)}">Stop</button>
        <button class="btn btn-secondary btn-sm" data-clear="${esc(p)}">Clear</button>
        <button class="btn btn-danger btn-sm" data-uninstall="${esc(p)}">Uninstall</button>
      </div>
    </div>`).join("");
  list.querySelectorAll("[data-uninstall]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm(`Uninstall ${b.dataset.uninstall}?`)) return;
    const r = await api(`/devices/${enc(serial())}/packages/${b.dataset.uninstall}`, { method: "DELETE" });
    toast(r.message); listPackages(thirdParty);
  }));
  list.querySelectorAll("[data-stop]").forEach(b => b.addEventListener("click", async () => {
    const r = await api(`/devices/${enc(serial())}/packages/${b.dataset.stop}/force-stop`, { method: "POST" });
    toast(r.message);
  }));
  list.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm(`Clear data for ${b.dataset.clear}?`)) return;
    const r = await api(`/devices/${enc(serial())}/packages/${b.dataset.clear}/clear`, { method: "POST" });
    toast(r.message);
  }));
}
document.getElementById("btnListApps").addEventListener("click", () => listPackages(false));
document.getElementById("btnListThirdParty").addEventListener("click", () => listPackages(true));
document.getElementById("apkUpload").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/devices/${enc(serial())}/packages/install?grant_permissions=true`, { method: "POST", body: fd });
  const r = await res.json();
  toast(r.message, r.ok ? "success" : "error");
  e.target.value = "";
});

// Files
async function browseFiles(path) {
  document.getElementById("filePath").value = path;
  const files = await api(`/devices/${enc(serial())}/files?path=${enc(path)}`);
  const list = document.getElementById("fileList");
  const parent = path.replace(/\/[^/]+\/?$/, "") || "/";
  list.innerHTML = (path !== "/" ? `<li data-path="${esc(parent)}" data-type="dir">📁 ..</li>` : "") +
    files.map(f => {
      const fp = path === "/" ? `/${f.name}` : `${path}/${f.name}`;
      return `<li data-path="${esc(fp)}" data-type="${f.type}">
        ${f.type === "dir" ? "📁" : "📄"} ${esc(f.name)}
        <span style="margin-left:auto;color:var(--text-muted);font-size:0.75rem;">${f.type === "file" ? fmtSize(f.size) : ""}</span>
        ${f.type !== "dir" ? `<button class="btn btn-danger btn-sm" data-del="${esc(fp)}" style="margin-left:0.5rem;">Del</button>` : ""}
      </li>`;
    }).join("");
  list.querySelectorAll("li").forEach(li => {
    li.addEventListener("click", e => {
      if (e.target.dataset.del) return;
      if (li.dataset.type === "dir" || li.textContent.includes("..")) browseFiles(li.dataset.path);
      else window.open(`${API}/devices/${enc(serial())}/files/download?path=${enc(li.dataset.path)}`);
    });
  });
  list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    if (!confirm("Delete?")) return;
    await api(`/devices/${enc(serial())}/files?path=${enc(b.dataset.del)}`, { method: "DELETE" });
    browseFiles(path);
  }));
}
function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}
document.getElementById("btnBrowse").addEventListener("click", () => browseFiles(document.getElementById("filePath").value));
document.getElementById("btnMkdir").addEventListener("click", async () => {
  const path = prompt("New directory path:");
  if (!path) return;
  const r = await api(`/devices/${enc(serial())}/files/mkdir?path=${enc(path)}`, { method: "POST" });
  toast(r.message);
});
document.getElementById("fileUpload").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const remote = document.getElementById("filePath").value.replace(/\/$/, "") + "/" + file.name;
  const fd = new FormData(); fd.append("file", file);
  const res = await fetch(`${API}/devices/${enc(serial())}/files/upload?remote_path=${enc(remote)}`, { method: "POST", body: fd });
  const r = await res.json();
  toast(r.message, r.ok ? "success" : "error");
  browseFiles(document.getElementById("filePath").value);
  e.target.value = "";
});

// Settings
document.getElementById("btnListSettings").addEventListener("click", async () => {
  const ns = document.getElementById("settingsNs").value;
  const r = await api(`/devices/${enc(serial())}/settings/${ns}`);
  document.getElementById("settingsOutput").textContent = r.settings || "(empty)";
});
document.getElementById("btnSettingGet").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/settings/get`, {
    method: "POST", body: JSON.stringify({
      namespace: document.getElementById("settingsNs").value,
      key: document.getElementById("settingKey").value,
    }),
  });
  document.getElementById("settingsOutput").textContent = r.value;
});
document.getElementById("btnSettingPut").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/settings/put`, {
    method: "POST", body: JSON.stringify({
      namespace: document.getElementById("settingsNs").value,
      key: document.getElementById("settingKey").value,
      value: document.getElementById("settingValue").value,
    }),
  });
  toast(r.message);
});
document.getElementById("btnGrant").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/permissions/grant`, {
    method: "POST", body: JSON.stringify({
      package: document.getElementById("permPackage").value,
      permission: document.getElementById("permName").value,
    }),
  });
  toast(r.message);
});
document.getElementById("btnRevoke").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/permissions/revoke`, {
    method: "POST", body: JSON.stringify({
      package: document.getElementById("permPackage").value,
      permission: document.getElementById("permName").value,
    }),
  });
  toast(r.message);
});

// Networking
document.getElementById("btnListForwards").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/forwards`);
  document.getElementById("forwardsOutput").textContent =
    "Forwards:\n" + (r.forwards.join("\n") || "(none)");
});
document.getElementById("btnAddForward").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/forwards`, {
    method: "POST", body: JSON.stringify({
      local: document.getElementById("fwdLocal").value,
      remote: document.getElementById("fwdRemote").value,
    }),
  });
  toast(r.message);
  document.getElementById("btnListForwards").click();
});
document.getElementById("btnClearForwards").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/forwards`, { method: "DELETE" });
  toast(r.message);
});
document.getElementById("btnListReverse").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/reverse`);
  const el = document.getElementById("forwardsOutput");
  el.textContent += "\n\nReverse:\n" + (r.reverse.join("\n") || "(none)");
});
document.getElementById("btnAddReverse").addEventListener("click", async () => {
  const r = await api(`/devices/${enc(serial())}/reverse`, {
    method: "POST", body: JSON.stringify({
      remote: document.getElementById("revRemote").value,
      local: document.getElementById("revLocal").value,
    }),
  });
  toast(r.message);
});


// Users
function userTypeLabel(u) {
  if (u.id === 0) return "Main profile";
  if (u.is_main || u.is_owner) return "Main profile";
  if ((u.type || "").includes("profile")) return "Extra TV profile (remove)";
  if (u.type === "com.android.tv.profile") return "Extra TV profile (remove)";
  if (u.type === "android.os.usertype.full.SECONDARY") return "Secondary user (remove)";
  return u.type || "unknown";
}

function renderUsersList(data) {
  const list = document.getElementById("usersList");
  const users = data.users || [];
  if (!users.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = users.map(u => `
    <div class="info-item" style="display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:0.5rem;">
      <div>
        <div class="label">User ${u.id}${u.id === data.current_user ? " (active)" : ""}${u.running ? " · running" : ""}</div>
        <div class="value" style="font-size:0.9rem;"><strong>${esc(u.name)}</strong> — ${esc(userTypeLabel(u))}</div>
      </div>
      <div style="display:flex; gap:0.5rem;">
        ${u.id !== data.current_user ? `<button class="btn btn-secondary btn-sm" data-switch-user="${u.id}">Switch</button>` : ""}
        ${u.id !== 0 ? `<button class="btn btn-danger btn-sm" data-remove-user="${u.id}" data-user-name="${esc(u.name)}">Remove</button>` : ""}
      </div>
    </div>
  `).join("");
  list.querySelectorAll("[data-remove-user]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.dataset.removeUser);
      const name = btn.dataset.userName;
      if (!confirm(`Remove user ${id} (${name})? This cannot be undone.`)) return;
      try {
        const r = await api(`/devices/${enc(serial())}/users/${id}`, { method: "DELETE" });
        toast(r.message, r.ok ? "success" : "error");
        loadUsers();
      } catch (e) { toast(e.message, "error"); }
    });
  });
  list.querySelectorAll("[data-switch-user]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        const r = await api(`/devices/${enc(serial())}/users/${btn.dataset.switchUser}/switch`, { method: "POST" });
        toast(r.message, r.ok ? "success" : "error");
        loadUsers();
      } catch (e) { toast(e.message, "error"); }
    });
  });
}

async function loadUsers() {
  if (!serial()) return;
  const r = await api(`/devices/${enc(serial())}/users`);
  renderUsersList(r);
  const lock = r.profile_lock?.likely_locked ? "Profile lock likely ON" : "Profile lock not detected";
  const lines = (r.users || []).map(u =>
    `User ${u.id}: ${u.name} [${u.type || "unknown"}] ${u.id === r.current_user ? "(active)" : ""}`
  );
  document.getElementById("usersOutput").textContent = lines.join("\n") + `\n\n${lock}`;
}

document.getElementById("btnListUsers").addEventListener("click", loadUsers);
document.getElementById("btnClearStreamingLoginsUsers")?.addEventListener("click", clearStreamingLogins);
document.getElementById("btnClearStreamingLogins")?.addEventListener("click", clearStreamingLogins);
document.getElementById("btnGuestRefresh")?.addEventListener("click", loadGuestStatus);
document.getElementById("btnGuestClearLoginsTop")?.addEventListener("click", clearStreamingLogins);
document.getElementById("btnSetStreamingSource")?.addEventListener("click", setStreamingSource);
document.getElementById("btnMirrorStreaming")?.addEventListener("click", mirrorStreamingApps);
document.getElementById("btnGuestWelcomeSave")?.addEventListener("click", saveGuestWelcomeWithToast);
document.getElementById("btnGuestWelcomeSaveDefaults")?.addEventListener("click", saveGuestWelcomeDefaultsWithToast);
document.getElementById("btnGuestWelcomeLoadDefaults")?.addEventListener("click", loadDefaultsIntoForm);
document.getElementById("btnGuestWelcomeReset")?.addEventListener("click", resetWelcomeToDefaults);
document.getElementById("btnGuestCheckIn")?.addEventListener("click", checkInGuest);
document.getElementById("btnGuestCheckOut")?.addEventListener("click", checkOutGuest);
document.getElementById("btnGuestWelcomeApply")?.addEventListener("click", applyGuestWelcome);
document.getElementById("guestWelcomeLogoUpload")?.addEventListener("change", e => uploadGuestWelcomeLogo(e.target.files?.[0]));
document.getElementById("guestWelcomeBackgroundUpload")?.addEventListener("change", e => uploadGuestWelcomeBackground(e.target.files?.[0]));
document.getElementById("btnGuestClearLogins")?.addEventListener("click", clearStreamingLogins);
document.getElementById("btnGuestClearLoginsAll")?.addEventListener("click", clearStreamingLoginsAll);
document.getElementById("btnGuestSetup")?.addEventListener("click", setupGuestExperience);
document.getElementById("btnWakeResetTv")?.addEventListener("click", wakeAndResetWelcome);
document.getElementById("btnWakeBedroomTvs")?.addEventListener("click", wakeBedroomTvs);
document.getElementById("btnSleepTv")?.addEventListener("click", sleepSelectedTv);
document.getElementById("btnRebootTv")?.addEventListener("click", rebootSelectedTv);
document.getElementById("btnPushWelcomeApp")?.addEventListener("click", () => {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  deployLauncherToDevice(selectedDevice.id, { label: "Push welcome app" });
});
document.getElementById("btnUpdateLauncherApk")?.addEventListener("click", () => {
  if (!selectedDevice) { toast("Select a TV first", "error"); return; }
  deployLauncherToDevice(selectedDevice.id, {
    label: "Update launcher APK",
    launchWelcome: false,
    forceReinstall: true,
  });
});
document.getElementById("btnPushWelcomeAll")?.addEventListener("click", deployLauncherToAllOnline);
document.getElementById("btnSetupPushWelcome")?.addEventListener("click", () => {
  if (!setupSelectedDeviceId) { toast("Select a connected TV in the list", "error"); return; }
  deployLauncherToDevice(setupSelectedDeviceId, { label: "Push welcome app" });
});
document.getElementById("btnSetupUpdateApk")?.addEventListener("click", () => {
  if (!setupSelectedDeviceId) { toast("Select a connected TV in the list", "error"); return; }
  deployLauncherToDevice(setupSelectedDeviceId, {
    label: "Update launcher APK",
    launchWelcome: false,
    forceReinstall: true,
  });
});
document.getElementById("btnProvisionTv")?.addEventListener("click", provisionNewTv);
document.getElementById("btnEnsureGuestReady")?.addEventListener("click", ensureGuestReady);

document.getElementById("btnRequestAdbEnable")?.addEventListener("click", async () => {
  if (!selectedDevice) return;
  try {
    await requestRemoteAdbEnable(selectedDevice.id);
    await loadRegistry();
    updateDeviceTypeUi();
  } catch (err) {
    toast(err.message || "Could not request ADB setup", "error");
  }
});
document.getElementById("btnAppsOnlyMode")?.addEventListener("click", enableAppsOnlyMode);
document.getElementById("btnGuestDeployAll")?.addEventListener("click", deployGuestExperienceAll);
document.getElementById("btnGuestRestore")?.addEventListener("click", restoreGuestExperience);

// Init
async function init() {
  initActivityLog();
  await loadHealth();
  await loadRegistry();
  updateGuestDeployUi();
  showHubView("setup");
  connectAllTvs({ silent: true });
  setInterval(async () => {
    await loadHealth();
    await loadRegistry();
    if (selectedDevice) {
      const u = registry.find(d => d.id === selectedDevice.id);
      if (u) {
        selectedDevice = u;
        updateConnectionUi();
      }
    }
  }, 15000);
}
init();
