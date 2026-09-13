const CARD_ICONS = {
  property: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>`,
  rules: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>`,
  tips: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.2 4.7-3 6.1V18a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.9A7 7 0 0 1 5 9a7 7 0 0 1 7-7z"/><path d="M9 22h6"/></svg>`,
  tv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 21h8M12 19v2"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
};

const GOOGLE_TV_PACKAGE = "com.google.android.apps.tv.launcherx";
const HUB_FALLBACK = (typeof window !== "undefined" && window.location?.origin)
  ? window.location.origin.replace(/\/$/, "")
  : "";
const HUB_PREVIEW = new URLSearchParams(window.location.search).get("hub_preview") === "1";

if (HUB_PREVIEW) {
  document.documentElement.classList.add("hub-preview");
  document.getElementById("btnClearLogins")?.setAttribute("hidden", "");
}

let focusables = [];
let focusIndex = 0;
let contentRevision = null;
let forecastDaysByDate = {};
let selectedForecastDate = null;
let focusDelegationBound = false;
let guestConfig = null;
let detailModalOpen = false;
let savedFocusIndex = 0;
let modalStack = [];
let modalFocusables = [];
let modalFocusIndex = 0;
let modalTrails = [];
let trailMapInstance = null;
let leafletLoading = null;
let streamingAppsState = [];
let uiEventsBound = false;
let clearLoginsBusy = false;

function hubCacheSuffix() {
  return hubBase().replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120) || "default";
}

function configCacheKey() {
  return `aatom_guest_public_config_${hubCacheSuffix()}`;
}

function imageCacheKey() {
  return `aatom_guest_image_cache_${hubCacheSuffix()}`;
}

function iconCacheKey() {
  return `aatom_guest_icon_cache_${hubCacheSuffix()}`;
}

const WEATHER_SVGS = {
  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
  cloudy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`,
  fog: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 14h16M4 18h10M6 10h14M8 6h12"/></svg>`,
  drizzle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M8 19v2M12 19v2M16 19v2"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M7 19v3M11 19v3M15 19v3"/></svg>`,
  snow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M8 19l1 2M12 19v2M16 19l-1 2"/></svg>`,
  showers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M6 19v2M10 19v3M14 19v2M18 19v3"/></svg>`,
  thunder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M13 11l-3 5h4l-2 4"/></svg>`,
};

const STAT_SVGS = {
  feels: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`,
  humidity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.32 0z"/></svg>`,
  wind: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>`,
  gust: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 16.6A2 2 0 1 1 11 20H2"/><path d="M12.8 2.8 16 6H2"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M8 19v2M12 19v3M16 19v2"/></svg>`,
  pressure: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  uv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/></svg>`,
};

function weatherCodeCategory(code) {
  const c = Number(code) || 0;
  if (c === 0) return "clear";
  if (c <= 3) return "cloudy";
  if (c <= 48) return "fog";
  if (c <= 57) return "drizzle";
  if (c <= 67) return "rain";
  if (c <= 77) return "snow";
  if (c <= 82) return "showers";
  if (c <= 86) return "snow";
  return "thunder";
}

function weatherIconHtml(code, sizeClass = "") {
  const cat = weatherCodeCategory(code);
  const size = sizeClass ? ` weather-icon-wrap--${sizeClass}` : "";
  return `<span class="weather-icon-wrap${size}">${WEATHER_SVGS[cat]}</span>`;
}

function setWeatherCardIcon(code) {
  const el = document.getElementById("weatherCardIcon");
  if (!el) return;
  const cat = weatherCodeCategory(code);
  el.innerHTML = WEATHER_SVGS[cat];
}

function hubBase() {
  if (window.HUB_BASE_URL) return String(window.HUB_BASE_URL).replace(/\/$/, "");
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return window.location.origin.replace(/\/$/, "");
  }
  return HUB_FALLBACK;
}

function apiUrl(path) {
  return `${hubBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

// If an old launcher APK opens localhost on the TV, bounce to the hub server.
(function redirectOffLocalhost() {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    const target = window.GUEST_PAGE_URL || `${HUB_FALLBACK}/guest/`;
    if (!window.location.href.startsWith(target)) {
      window.location.replace(target);
    }
  }
})();

function esc(text) {
  const el = document.createElement("span");
  el.textContent = text || "";
  return el.innerHTML;
}

function androidBridge() {
  try {
    if (typeof GuestLauncher !== "undefined") return GuestLauncher;
  } catch (_) { /* injected interface may throw when absent */ }
  return window.GuestLauncher || null;
}

function launchApp(packageName) {
  const bridge = androidBridge();
  if (bridge && typeof bridge.launchApp === "function") {
    bridge.launchApp(packageName);
    return true;
  }
  return false;
}

function openGoogleTv() {
  const bridge = androidBridge();
  if (bridge && typeof bridge.closeToGoogleTv === "function") {
    bridge.closeToGoogleTv();
    return;
  }
  if (bridge && typeof bridge.openGoogleTv === "function") {
    bridge.openGoogleTv();
    return;
  }
  if (launchApp(GOOGLE_TV_PACKAGE)) return;
  window.location.href = [
    "intent:#Intent",
    "action=android.intent.action.MAIN",
    `component=${GOOGLE_TV_PACKAGE}/.home.HomeActivity`,
    "launchFlags=0x14000000",
    "end",
  ].join(";");
}

function updateClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  el.textContent = new Date().toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hostTipsPreview(tips) {
  if (!tips) return "";
  const upper = String(tips).toUpperCase();
  const idx = upper.indexOf("HIKING NEAR");
  if (idx > 0) return String(tips).slice(0, idx).trim();
  if (idx === 0) return "";
  return String(tips).trim();
}

function propertyLocation() {
  const prop = guestConfig?.property_map || {};
  const lat = Number(prop.lat);
  const lon = Number(prop.lon);
  const label = prop.label || guestConfig?.property_name || guestConfig?.property_title || "Property";
  return {
    lat: Number.isFinite(lat) ? lat : 39.8283,
    lon: Number.isFinite(lon) ? lon : -98.5795,
    label,
    address: prop.address || label,
  };
}

function loadStylesheet(href) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load ${href}`));
    document.head.appendChild(link);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureLeaflet() {
  if (window.L) return;
  if (!leafletLoading) {
    leafletLoading = Promise.all([
      loadStylesheet("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"),
      loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"),
    ]);
  }
  await leafletLoading;
}

function destroyTrailMap() {
  if (trailMapInstance) {
    trailMapInstance.remove();
    trailMapInstance = null;
  }
}

async function fetchDrivingRoute(fromLat, fromLon, toLat, toLon) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    return {
      points: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      distanceMi: route.distance / 1609.344,
      durationMin: route.duration / 60,
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function mountTrailMap(trail) {
  const container = document.getElementById("trailMapCanvas");
  const metaEl = document.getElementById("trailRouteMeta");
  if (!container || !trail) return;

  destroyTrailMap();
  container.innerHTML = `<div class="trail-map-loading">Loading route from ${esc(propertyLocation().label)}…</div>`;

  const home = propertyLocation();
  const route = await fetchDrivingRoute(home.lat, home.lon, trail.lat, trail.lon);

  if (metaEl) {
    if (route) {
      metaEl.textContent = `Driving from ${home.address}: ${route.distanceMi.toFixed(1)} mi, ~${Math.round(route.durationMin)} min`;
    } else {
      metaEl.textContent = `From ${home.address} to trailhead — straight-line route shown (roads unavailable)`;
    }
  }

  await ensureLeaflet();
  container.innerHTML = "";

  const map = window.L.map(container, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
    keyboard: false,
    dragging: true,
  });
  trailMapInstance = map;

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const homeIcon = window.L.divIcon({
    className: "trail-map-marker trail-map-marker--home",
    html: "<span aria-hidden=\"true\">⌂</span>",
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
  const trailIcon = window.L.divIcon({
    className: "trail-map-marker trail-map-marker--trail",
    html: "<span aria-hidden=\"true\">▲</span>",
    iconSize: [38, 38],
    iconAnchor: [19, 32],
  });

  window.L.marker([home.lat, home.lon], { icon: homeIcon, zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup(`<strong>${esc(home.label)}</strong><br>${esc(home.address)}`);

  window.L.marker([trail.lat, trail.lon], { icon: trailIcon })
    .addTo(map)
    .bindPopup(`<strong>${esc(trail.name)}</strong>${trail.trailhead ? `<br>${esc(trail.trailhead)}` : ""}`);

  const bounds = window.L.latLngBounds([[home.lat, home.lon], [trail.lat, trail.lon]]);

  if (route?.points?.length) {
    window.L.polyline(route.points, {
      color: "#d4a853",
      weight: 6,
      opacity: 0.92,
      lineJoin: "round",
    }).addTo(map);
    bounds.extend(route.points);
  } else {
    window.L.polyline([[home.lat, home.lon], [trail.lat, trail.lon]], {
      color: "#d4a853",
      weight: 4,
      opacity: 0.55,
      dashArray: "10 12",
    }).addTo(map);
  }

  map.fitBounds(bounds.pad(0.14));
  setTimeout(() => map.invalidateSize(), 120);
}

function trailDriveLabel(trail) {
  const mi = trail.drive_mi;
  const miText = typeof mi === "number" && !Number.isInteger(mi) ? `${mi} mi` : `${mi} mi`;
  return `${miText}, ~${trail.drive_min} min drive`;
}

function makeTrailsCard(trails, hostTips) {
  if (!trails?.length) return null;
  const host = hostTipsPreview(hostTips);
  const preview = trails.slice(0, 4).map(trail => {
    const tag = trail.category === "in_town" ? "In town" : "Nearby";
    return `<li><span class="trail-preview-tag">${esc(tag)}</span> ${esc(trail.name)} <span class="trail-preview-meta">(~${trail.drive_min} min)</span></li>`;
  }).join("");
  const card = document.createElement("article");
  card.className = "info-card focusable info-card--trails";
  card.dataset.trailsCard = "1";
  card.tabIndex = 0;
  card.innerHTML = `
    <div class="card-icon" aria-hidden="true">${CARD_ICONS.tips}</div>
    <div class="card-body">
      <h2 class="card-title">Local trails &amp; tips</h2>
      ${host ? `<p class="card-text card-text--compact">${esc(host)}</p>` : ""}
      <ul class="trail-preview-list">${preview}</ul>
      <p class="card-hint">Press OK to browse ${trails.length} trails with maps</p>
    </div>`;
  return card;
}

function renderTrailsListHtml(trails, hostTips) {
  const host = hostTipsPreview(hostTips);
  const sections = [
    { label: "In town (5–10 min)", items: trails.filter(t => t.category === "in_town") },
    { label: "A bit farther", items: trails.filter(t => t.category !== "in_town") },
  ];
  const parts = [];
  if (host) {
    parts.push(`<p class="detail-modal-text detail-modal-text--compact">${esc(host)}</p>`);
  }
  for (const section of sections) {
    if (!section.items.length) continue;
    parts.push(`<h3 class="trail-section-title">${esc(section.label)}</h3>`);
    parts.push(`<div class="trail-list">${section.items.map(trail => `
      <button type="button" class="trail-item focusable" data-trail-id="${esc(trail.id)}" tabindex="0">
        <span class="trail-item-name">${esc(trail.name)}</span>
        <span class="trail-item-meta">${esc(trailDriveLabel(trail))} · ${esc(trail.length)}, ${esc(trail.difficulty)}</span>
        ${trail.trailhead ? `<span class="trail-item-head">${esc(trail.trailhead)}</span>` : ""}
        <span class="trail-item-action">View map →</span>
      </button>`).join("")}</div>`);
  }
  parts.push(`<p class="trail-list-hint">Select a trail and press OK for the map and directions.</p>`);
  return parts.join("");
}

function renderTrailMapHtml(trail) {
  const home = propertyLocation();
  const origin = encodeURIComponent(home.address);
  const destination = trail.trailhead
    ? encodeURIComponent(`${trail.trailhead}, Desert Hot Springs, CA`)
    : encodeURIComponent(`${trail.lat},${trail.lon}`);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  return `
    <div class="trail-map-detail">
      <p class="trail-map-meta">${esc(trailDriveLabel(trail))} · ${esc(trail.length)}, ${esc(trail.difficulty)}</p>
      <p class="trail-map-home"><strong>From:</strong> ${esc(home.address)}</p>
      ${trail.trailhead ? `<p class="trail-map-head"><strong>Trailhead:</strong> ${esc(trail.trailhead)}</p>` : ""}
      ${trail.note ? `<p class="trail-map-note">${esc(trail.note)}</p>` : ""}
      <p class="trail-map-route-meta" id="trailRouteMeta">Loading route from ${esc(home.label)}…</p>
      <div class="trail-map-canvas-wrap">
        <div id="trailMapCanvas" class="trail-map-canvas" data-trail-id="${esc(trail.id)}"></div>
      </div>
      <div class="trail-map-legend-static" aria-hidden="true">
        <span class="legend-item legend-home">⌂ ${esc(home.label)}</span>
        <span class="legend-item legend-trail">▲ Trailhead</span>
        <span class="legend-item legend-route">— Driving route</span>
      </div>
      <p class="trail-map-directions">Open turn-by-turn directions on your phone:</p>
      <a class="trail-map-link" href="${directionsUrl}" target="_blank" rel="noopener noreferrer">Google Maps: ${esc(home.address)} → ${esc(trail.name)}</a>
    </div>`;
}

function isTrailMapView() {
  return !!document.getElementById("trailMapCanvas");
}

function getModalBody() {
  return document.getElementById("detailModalBody");
}

function scrollModalBody(delta) {
  const body = getModalBody();
  if (!body) return;
  body.scrollTop = Math.max(0, Math.min(body.scrollTop + delta, body.scrollHeight - body.clientHeight));
}

function updateModalChrome() {
  const backBtn = document.getElementById("btnDetailBack");
  const hint = document.getElementById("detailModalHint");
  const canBack = modalStack.length > 0;
  if (backBtn) backBtn.hidden = !canBack;
  if (hint) {
    if (isTrailMapView()) {
      hint.textContent = "← All trails to go back · ↓↑ scroll map details · Close exits";
    } else if (document.querySelector("#detailModalBody .trail-item")) {
      hint.textContent = "↑↓ browse trails · OK opens map · Close exits";
    } else {
      hint.textContent = "Press Back or Close to return";
    }
  }
}

function ensureModalFocusVisible(el) {
  if (!el) return;
  const container = getModalBody();
  if (!container || !container.contains(el)) return;
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const padding = 16;
  if (eRect.top < cRect.top + padding) {
    container.scrollTop += eRect.top - cRect.top - padding;
  } else if (eRect.bottom > cRect.bottom - padding) {
    container.scrollTop += eRect.bottom - cRect.bottom + padding;
  }
}

function refreshModalFocus() {
  modalFocusables = [
    ...document.querySelectorAll("#detailModalBody .trail-item.focusable"),
    document.getElementById("btnDetailBack"),
    document.getElementById("btnDetailClose"),
  ].filter(el => el && !el.hidden);
  modalFocusIndex = 0;
  if (modalFocusables.length) {
    setModalFocus(0);
  } else {
    document.getElementById("btnDetailClose")?.focus({ preventScroll: true });
  }
}

function refreshModalFocusForMap() {
  modalFocusables = [
    document.getElementById("btnDetailBack"),
    document.getElementById("btnDetailClose"),
  ].filter(el => el && !el.hidden);
  modalFocusIndex = 0;
  if (modalFocusables.length) {
    setModalFocus(0);
  }
}

function setModalFocus(index) {
  if (!modalFocusables.length) return;
  modalFocusIndex = Math.max(0, Math.min(index, modalFocusables.length - 1));
  modalFocusables.forEach((el, i) => el.classList.toggle("focused", i === modalFocusIndex));
  const current = modalFocusables[modalFocusIndex];
  current?.focus({ preventScroll: true });
  if (current?.classList?.contains("trail-item")) {
    ensureModalFocusVisible(current);
  }
}

function modalGoBack() {
  if (modalStack.length) {
    restoreModalFromStack();
    return;
  }
  closeDetailModal(true);
}

function pushModalState() {
  const titleEl = document.getElementById("detailModalTitle");
  const bodyEl = document.getElementById("detailModalBody");
  if (!titleEl || !bodyEl) return;
  modalStack.push({ title: titleEl.textContent || "", html: bodyEl.innerHTML });
}

function restoreModalFromStack() {
  const prev = modalStack.pop();
  if (!prev) {
    closeDetailModal(true);
    return;
  }
  destroyTrailMap();
  const titleEl = document.getElementById("detailModalTitle");
  const bodyEl = document.getElementById("detailModalBody");
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = prev.title;
  bodyEl.innerHTML = prev.html;
  bodyEl.scrollTop = 0;
  updateModalChrome();
  refreshModalFocus();
}

function openTrailsListModal(trails, hostTips) {
  modalTrails = trails || [];
  modalStack = [];
  openDetailModal("Local trails", renderTrailsListHtml(modalTrails, hostTips), { setupFocus: true });
}

function openTrailMapModal(trail, pushStack = true) {
  if (!trail) return;
  if (pushStack) pushModalState();
  openDetailModal(trail.name, renderTrailMapHtml(trail), { setupFocus: false, preserveStack: true });
  updateModalChrome();
  refreshModalFocusForMap();
  mountTrailMap(trail).then(() => {
    updateModalChrome();
    refreshModalFocusForMap();
  }).catch(() => {
    const metaEl = document.getElementById("trailRouteMeta");
    if (metaEl) metaEl.textContent = "Could not load map — use the Google Maps link below.";
    updateModalChrome();
    refreshModalFocusForMap();
  });
}

function makeInfoCard(title, text, iconKey) {
  if (!text || !String(text).trim()) return null;
  const card = document.createElement("article");
  card.className = "info-card focusable";
  card.tabIndex = 0;
  card.innerHTML = `
    <div class="card-icon" aria-hidden="true">${CARD_ICONS[iconKey] || CARD_ICONS.rules}</div>
    <div class="card-body">
      <h2 class="card-title">${esc(title)}</h2>
      <p class="card-text">${esc(text)}</p>
    </div>`;
  return card;
}

function formatStationStat(label, value) {
  return `<div class="station-stat"><span class="station-stat-label">${esc(label)}</span><span class="station-stat-value">${esc(value)}</span></div>`;
}

function renderWeatherPillStats(station, isLive) {
  const el = document.getElementById("weatherPillStats");
  if (!el) return;
  if (!isLive || !station) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }

  const chips = [];
  if (station.humidity_pct != null) {
    chips.push({ icon: "humidity", value: `${station.humidity_pct}%` });
  }
  if (station.wind_mph != null) {
    const wind = station.wind_direction
      ? `${station.wind_direction} ${station.wind_mph}`
      : `${station.wind_mph}`;
    chips.push({ icon: "wind", value: `${wind} mph` });
  }
  if (station.wind_gust_mph > station.wind_mph) {
    chips.push({ icon: "gust", value: `${station.wind_gust_mph} mph` });
  }
  if (station.rain_today_in != null) {
    chips.push({ icon: "rain", value: `${station.rain_today_in}"` });
  }
  if (station.pressure_inhg) {
    const trend = station.pressure_trend ? ` ${station.pressure_trend}` : "";
    chips.push({ icon: "pressure", value: `${station.pressure_inhg}${trend}` });
  }
  if (station.uv > 0) {
    chips.push({ icon: "uv", value: `UV ${station.uv}` });
  }

  if (!chips.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }

  el.innerHTML = chips.map(chip => `
    <span class="weather-pill-stat" title="${esc(chip.value)}">
      <span class="weather-pill-stat-icon" aria-hidden="true">${STAT_SVGS[chip.icon]}</span>
      <span class="weather-pill-stat-value">${esc(chip.value)}</span>
    </span>`).join("");
  el.hidden = false;
}

function renderStationStats(station) {
  const el = document.getElementById("stationStats");
  if (!el || !station) {
    if (el) el.hidden = true;
    return;
  }

  const stats = [];
  if (station.feels_like_f && station.feels_like_f !== station.temperature_f) {
    stats.push(formatStationStat("Feels like", `${station.feels_like_f}°F`));
  }
  if (station.humidity_pct != null) {
    stats.push(formatStationStat("Humidity", `${station.humidity_pct}%`));
  }
  if (station.wind_mph != null) {
    const wind = station.wind_direction
      ? `${station.wind_direction} ${station.wind_mph} mph`
      : `${station.wind_mph} mph`;
    stats.push(formatStationStat("Wind", wind));
  }
  if (station.wind_gust_mph > station.wind_mph) {
    stats.push(formatStationStat("Gusts", `${station.wind_gust_mph} mph`));
  }
  if (station.rain_today_in != null) {
    stats.push(formatStationStat("Rain today", `${station.rain_today_in}"`));
  }
  if (station.pressure_inhg) {
    const trend = station.pressure_trend ? ` (${station.pressure_trend})` : "";
    stats.push(formatStationStat("Pressure", `${station.pressure_inhg} inHg${trend}`));
  }
  if (station.uv > 0) {
    stats.push(formatStationStat("UV index", String(station.uv)));
  }

  if (!stats.length) {
    el.hidden = true;
    return;
  }

  el.innerHTML = stats.join("");
  el.hidden = false;
}

function readJsonCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeJsonCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

function readConfigCache() {
  const cached = readJsonCache(configCacheKey());
  return cached && typeof cached === "object" ? cached : null;
}

function saveConfigCache(config) {
  if (!config || typeof config !== "object") return;
  writeJsonCache(configCacheKey(), config);
}

function readImageCache() {
  return readJsonCache(imageCacheKey()) || {};
}

function readIconCache() {
  return readJsonCache(iconCacheKey()) || {};
}

function cachedImageUrl(key, remoteUrl) {
  if (!remoteUrl) return remoteUrl;
  const images = readImageCache();
  return images[key] || remoteUrl;
}

function cachedIconUrl(packageName, remoteUrl) {
  if (!remoteUrl) return remoteUrl;
  const icons = readIconCache();
  return icons[packageName] || remoteUrl;
}

async function cacheRemoteImage(key, url) {
  if (!url || !url.startsWith("http")) return null;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const images = readImageCache();
    images[key] = dataUrl;
    writeJsonCache(imageCacheKey(), images);
    return dataUrl;
  } catch (_) {
    return null;
  }
}

async function warmStaticAssets(config) {
  const tasks = [];
  if (config.logo_url) tasks.push(cacheRemoteImage("logo", config.logo_url));
  if (config.background_url) tasks.push(cacheRemoteImage("background", config.background_url));
  for (const app of config.streaming_apps || []) {
    if (!app.icon_url) continue;
    tasks.push((async () => {
      try {
        const res = await fetch(app.icon_url, { cache: "force-cache" });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        const icons = readIconCache();
        icons[app.package] = dataUrl;
        writeJsonCache(iconCacheKey(), icons);
      } catch (_) { /* optional cache warm */ }
    })());
  }
  await Promise.allSettled(tasks);
}

function renderHeroQr(config) {
  const heroWrap = document.getElementById("heroQrWrap");
  const heroQr = document.getElementById("heroQrContainer");
  const heroSsid = document.getElementById("heroWifiSsid");
  if (!heroWrap || !heroQr) return;

  if (config.has_wifi_qr) {
    heroQr.innerHTML = `<img src="${apiUrl("/api/guest-welcome/qr.png")}" alt="WiFi QR Code" />`;
    if (heroSsid) heroSsid.textContent = config.wifi_ssid || "";
    heroWrap.hidden = false;
  } else {
    heroWrap.hidden = true;
  }
}

function isAppInstalledLocal(packageName) {
  const bridge = androidBridge();
  if (bridge && typeof bridge.isAppInstalled === "function") {
    try {
      return !!bridge.isAppInstalled(packageName);
    } catch (_) { /* bridge unavailable */ }
  }
  return null;
}

function setStreamingStatus(message, isError = false) {
  const el = document.getElementById("streamingStatus");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#fca5a5" : "";
}

function launchPackageForApp(app) {
  return app?.device_package || app?.package;
}

function isAppInstalledForApp(app) {
  if (!app) return false;
  if (app.installed === true) return true;
  const launchPkg = launchPackageForApp(app);
  const local = isAppInstalledLocal(launchPkg);
  if (local === true) return true;
  if (launchPkg !== app.package) {
    const catalogLocal = isAppInstalledLocal(app.package);
    if (catalogLocal === true) return true;
  }
  return false;
}

function renderStreamingApps(apps) {
  streamingAppsState = apps || [];
  const section = document.getElementById("streamingSection");
  const grid = document.getElementById("streamingGrid");
  if (!section || !grid) return;

  if (!streamingAppsState.length) {
    section.hidden = true;
    grid.innerHTML = "";
    return;
  }

  section.hidden = false;
  grid.innerHTML = streamingAppsState.map(app => {
    const installed = isAppInstalledForApp(app);
    const needsDownload = !installed && app.install_available;
    const badge = needsDownload
      ? '<span class="streaming-tile-badge cloud" title="Download and install">Install</span>'
      : "";
    const icon = app.icon_url
      ? `<img class="streaming-tile-icon" src="${esc(cachedIconUrl(app.package, app.icon_url))}" alt="" />`
      : `<div class="streaming-tile-icon"></div>`;
    return `<button type="button" class="streaming-tile focusable" data-package="${esc(app.package)}" tabindex="0" role="option">
      ${icon}
      <span class="streaming-tile-label">${esc(app.label || app.package)}</span>
      ${badge}
    </button>`;
  }).join("");
}

async function installStreamingApp(packageName) {
  const res = await fetch(apiUrl("/api/guest-welcome/install-app"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ package: packageName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || res.statusText || "Install failed");
  }
  return data;
}

async function clearStreamingLoginsOnTv() {
  const res = await fetch(apiUrl("/api/guest-welcome/clear-streaming-logins"), {
    method: "POST",
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || res.statusText || "Clear failed");
  }
  return data;
}

function setupConfirmModalFocus() {
  modalFocusables = [
    document.getElementById("btnConfirmClearLogins"),
    document.getElementById("btnCancelClearLogins"),
    document.getElementById("btnDetailClose"),
  ].filter(el => el && !el.hidden);
  modalFocusIndex = 0;
  if (modalFocusables.length) setModalFocus(0);
  const hint = document.getElementById("detailModalHint");
  if (hint) hint.textContent = "← → choose action · OK confirms · Close cancels";
}

function openClearLoginsConfirm() {
  if (clearLoginsBusy) return;
  openDetailModal(
    "Clear all streaming logins?",
    `<p class="detail-modal-text">This removes saved sign-ins from every streaming app on this TV — Netflix, Disney+, Plex, and the rest.</p>
     <p class="detail-modal-text detail-modal-text--compact">Use this before checkout so no guest account or viewing history is left behind.</p>
     <div class="confirm-actions">
       <button type="button" class="confirm-action confirm-action--primary focusable" id="btnConfirmClearLogins" tabindex="0">Clear all logins</button>
       <button type="button" class="confirm-action focusable" id="btnCancelClearLogins" tabindex="0">Cancel</button>
     </div>`,
    { setupFocus: true },
  );
  setupConfirmModalFocus();
}

async function runClearStreamingLogins() {
  if (clearLoginsBusy) return;
  clearLoginsBusy = true;
  const btn = document.getElementById("btnClearLogins");
  btn?.setAttribute("disabled", "");
  setStreamingStatus("Clearing streaming app logins…");
  try {
    const result = await clearStreamingLoginsOnTv();
    const count = result.cleared?.length || 0;
    setStreamingStatus(
      result.ok
        ? `Cleared ${count} app${count === 1 ? "" : "s"}. Each streaming app will need a fresh sign-in.`
        : `Cleared ${count} app${count === 1 ? "" : "s"}, but some apps could not be reset.`,
      !result.ok,
    );
  } catch (err) {
    setStreamingStatus(err.message || "Could not clear streaming logins", true);
  } finally {
    clearLoginsBusy = false;
    btn?.removeAttribute("disabled");
  }
}

async function openStreamingApp(packageName) {
  const app = streamingAppsState.find(a => a.package === packageName);
  if (!app) return;

  const tile = document.querySelector(`.streaming-tile[data-package="${packageName}"]`);
  const installed = isAppInstalledForApp(app);

  if (installed) {
    if (!launchApp(launchPackageForApp(app))) {
      setStreamingStatus(`Could not open ${app.label || packageName}`, true);
    }
    return;
  }

  if (!app.install_available) {
    setStreamingStatus(
      `${app.label || packageName} is not on this TV yet. Ask your host to install it from the hub.`,
      true,
    );
    return;
  }

  tile?.classList.add("installing");
  setStreamingStatus(`Downloading and installing ${app.label || packageName}…`);
  try {
    const result = await installStreamingApp(packageName);
    if (!result.ok) {
      throw new Error(result.message || "Install failed");
    }
    app.installed = true;
    tile?.classList.remove("installing");
    renderStreamingApps(streamingAppsState);
    setStreamingStatus(`${app.label || packageName} installed`);
    if (!launchApp(launchPackageForApp(app))) {
      setStreamingStatus(`Installed ${app.label || packageName} — press OK again to open`, false);
    }
    collectFocusables();
  } catch (err) {
    tile?.classList.remove("installing");
    setStreamingStatus(err.message || "Install failed", true);
  }
}

function openDetailModal(title, bodyHtml, options = {}) {
  const overlay = document.getElementById("detailOverlay");
  const titleEl = document.getElementById("detailModalTitle");
  const bodyEl = document.getElementById("detailModalBody");
  if (!overlay || !titleEl || !bodyEl) return;
  if (!options.preserveStack) modalStack = [];
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  bodyEl.scrollTop = 0;
  overlay.hidden = false;
  detailModalOpen = true;
  savedFocusIndex = focusIndex;
  if (options.setupFocus) {
    refreshModalFocus();
  } else if (!options.keepFocus) {
    const closeBtn = document.getElementById("btnDetailClose");
    closeBtn?.focus({ preventScroll: true });
    closeBtn?.classList.add("focused");
  }
  updateModalChrome();
}

function closeDetailModal(force = false) {
  const overlay = document.getElementById("detailOverlay");
  if (!overlay || overlay.hidden) return;
  if (!force && modalStack.length) {
    restoreModalFromStack();
    return;
  }
  destroyTrailMap();
  overlay.hidden = true;
  detailModalOpen = false;
  modalStack = [];
  modalFocusables = [];
  modalFocusIndex = 0;
  modalTrails = [];
  document.getElementById("btnDetailClose")?.classList.remove("focused");
  document.getElementById("btnDetailBack")?.classList.remove("focused");
  document.getElementById("btnDetailBack")?.setAttribute("hidden", "");
  setFocus(savedFocusIndex);
}

function openWifiDetail() {
  const config = guestConfig;
  if (!config) return;
  const parts = [];
  if (config.has_wifi_qr) {
    parts.push(`<div class="detail-wifi-qr"><img src="${apiUrl("/api/guest-welcome/qr.png")}" alt="WiFi QR Code" /></div>`);
  }
  const fields = [];
  if (config.wifi_ssid) {
    fields.push(`<div class="wifi-field"><span class="field-label">Network</span><span class="field-value">${esc(config.wifi_ssid)}</span></div>`);
  }
  if (config.wifi_password) {
    fields.push(`<div class="wifi-field"><span class="field-label">Password</span><span class="field-value field-value--mono">${esc(config.wifi_password)}</span></div>`);
  }
  if (fields.length) {
    parts.push(`<div class="detail-wifi-fields">${fields.join("")}</div>`);
  }
  openDetailModal("Guest WiFi", `<div class="detail-wifi-layout">${parts.join("")}</div>`);
}

function openGuidebookDetail() {
  const config = guestConfig;
  if (!config?.has_guidebook_qr) return;
  openDetailModal(
    "Digital guidebook",
    `<div class="detail-guidebook-qr"><img src="${apiUrl("/api/guest-welcome/guidebook-qr.png")}" alt="Guidebook QR" /></div>
     <p class="detail-guidebook-hint">Scan with your phone for the house manual, local tips, and more.</p>`,
  );
}

function openWeatherDetail() {
  const body = document.getElementById("weatherCard")?.querySelector(".card-body");
  if (!body) return;
  const clone = body.cloneNode(true);
  clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
  openDetailModal("Weather", `<div class="detail-weather">${clone.innerHTML}</div>`);
}

function openCardDetail(card) {
  if (!card) return;
  if (card.id === "wifiCard") {
    openWifiDetail();
    return;
  }
  if (card.id === "guidebookCard") {
    openGuidebookDetail();
    return;
  }
  if (card.id === "weatherCard") {
    openWeatherDetail();
    return;
  }
  if (card.dataset.trailsCard === "1") {
    openTrailsListModal(guestConfig?.local_trails || [], guestConfig?.local_tips);
    return;
  }
  const title = card.querySelector(".card-title")?.textContent?.trim() || "Details";
  const text = card.querySelector(".card-text")?.textContent?.trim();
  if (text) {
    openDetailModal(title, `<p class="detail-modal-text">${esc(text)}</p>`);
  }
}

function isExpandableCard(el) {
  return el?.classList?.contains("info-card") && el.classList.contains("focusable");
}

function scrollWelcomeToTop() {
  document.getElementById("contentScroll")?.scrollTo({ top: 0, behavior: "smooth" });
}

function getScrollContainer() {
  return document.getElementById("contentScroll");
}

function ensureFocusVisible(el) {
  if (!el) return;
  const container = getScrollContainer();
  if (!container || !container.contains(el)) return;
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const padding = 20;
  if (eRect.top < cRect.top + padding) {
    container.scrollTop += eRect.top - cRect.top - padding;
  } else if (eRect.bottom > cRect.bottom - padding) {
    container.scrollTop += eRect.bottom - cRect.bottom + padding;
  }
}

function renderHourlyPanel(day) {
  const panel = document.getElementById("hourlyPanel");
  const strip = document.getElementById("hourlyStrip");
  const title = document.getElementById("hourlyPanelTitle");
  if (!panel || !strip) return;

  if (!day || !(day.hours || []).length) {
    panel.hidden = true;
    strip.innerHTML = "";
    return;
  }

  if (title) {
    title.textContent = `${day.day_name} · hourly`;
  }

  strip.innerHTML = day.hours.map(hour => {
    const wind = hour.wind_mph
      ? `${hour.wind_direction ? `${hour.wind_direction} ` : ""}${hour.wind_mph} mph`
      : "";
    const gust = hour.wind_gust_mph > hour.wind_mph ? ` (gust ${hour.wind_gust_mph})` : "";
    const precip = hour.precip_chance > 0
      ? `${hour.precip_chance}% rain`
      : (hour.precip_in > 0 ? `${hour.precip_in}"` : "");
    const feels = hour.feels_like_f && hour.feels_like_f !== hour.temperature_f
      ? `feels ${hour.feels_like_f}°`
      : "";
    return `<div class="hourly-slot">
      <div class="hourly-slot-time">${esc(hour.hour_label)}</div>
      <div class="hourly-slot-icon">${weatherIconHtml(hour.weather_code)}</div>
      <div class="hourly-slot-temp">${hour.temperature_f}°</div>
      ${feels ? `<div class="hourly-slot-feels">${esc(feels)}</div>` : ""}
      ${wind ? `<div class="hourly-slot-wind">${esc(wind)}${esc(gust)}</div>` : ""}
      ${precip ? `<div class="hourly-slot-precip">${esc(precip)}</div>` : ""}
      ${hour.humidity_pct ? `<div class="hourly-slot-precip">${hour.humidity_pct}% humidity</div>` : ""}
    </div>`;
  }).join("");

  panel.hidden = false;
}

function selectForecastDay(date, scrollHourly = true) {
  selectedForecastDate = date;
  const day = forecastDaysByDate[date];
  document.querySelectorAll(".forecast-day").forEach(el => {
    el.classList.toggle("selected", el.dataset.date === date);
    el.setAttribute("aria-selected", el.dataset.date === date ? "true" : "false");
  });
  renderHourlyPanel(day);
  if (scrollHourly) {
    const panel = document.getElementById("hourlyPanel");
    if (panel) ensureFocusVisible(panel);
  }
}
function formatStayDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function shortCondition(condition) {
  if (!condition) return "";
  const text = String(condition);
  if (text.length <= 12) return text;
  return text.replace("Thunderstorms", "T-storms").replace("Partly Cloudy", "Partly").slice(0, 14);
}

function renderStayDates(config) {
  const stay = config.stay;
  const row = document.getElementById("stayDates");
  const checkInEl = document.getElementById("checkInDate");
  const checkOutEl = document.getElementById("checkOutDate");
  const checkOutTimeEl = document.getElementById("checkOutTime");
  const checkoutPill = document.getElementById("checkoutPill");
  const checkoutValue = document.getElementById("checkoutValue");

  if (stay?.check_in && checkInEl) {
    checkInEl.textContent = stay.check_in_display || formatStayDate(stay.check_in);
  }
  if (stay?.check_out && checkOutEl) {
    checkOutEl.textContent = stay.check_out_display || formatStayDate(stay.check_out);
  }

  const hasStayDates = stay && (stay.check_in || stay.check_out);
  if (row) row.hidden = !hasStayDates;

  const checkoutTime = stay?.checkout_time || config.checkout_time || "";
  if (hasStayDates && checkoutTime && checkOutTimeEl) {
    checkOutTimeEl.textContent = `by ${checkoutTime}`;
    checkOutTimeEl.hidden = false;
    if (checkoutPill) checkoutPill.hidden = true;
  } else if (checkoutTime && checkoutPill && checkoutValue) {
    checkoutValue.textContent = checkoutTime;
    checkoutPill.hidden = false;
    if (checkOutTimeEl) checkOutTimeEl.hidden = true;
  } else if (checkoutPill) {
    checkoutPill.hidden = true;
    if (checkOutTimeEl) checkOutTimeEl.hidden = true;
  }
}

function renderWeather(config) {
  const weather = config.weather;
  const weatherPill = document.getElementById("weatherPill");
  const weatherTemp = document.getElementById("weatherTemp");
  const weatherDetail = document.getElementById("weatherDetail");
  const weatherCard = document.getElementById("weatherCard");
  const weatherCardTitle = document.getElementById("weatherCardTitle");

  if (!weather) return;

  const station = weather.station;
  const isLive = weather.source === "tempest" && station;

  if (weatherPill && weatherTemp && weatherDetail) {
    const displayTemp = isLive && station ? station.temperature_f : weather.temperature_f;
    const feelsLike = isLive && station
      ? station.feels_like_f
      : (weather.feels_like_f ?? weather.apparent_temperature_f ?? null);
    const displayCondition = isLive && station ? station.condition : weather.condition;
    weatherTemp.textContent = `${displayTemp}°F`;
    const feelsWrap = document.getElementById("weatherFeelsWrap");
    const feelsEl = document.getElementById("weatherFeelsLike");
    if (feelsWrap && feelsEl && feelsLike != null && feelsLike !== "") {
      feelsEl.textContent = `${feelsLike}°F`;
      feelsWrap.hidden = false;
    } else if (feelsWrap) {
      feelsWrap.hidden = true;
    }
    const pillIcon = document.getElementById("weatherPillIcon");
    if (pillIcon) pillIcon.innerHTML = WEATHER_SVGS[weatherCodeCategory(weather.weather_code)];
    const parts = [displayCondition];
    if (isLive) {
      parts.push(station.location_label || "Live on-site");
    } else if (weather.location) {
      parts.push(weather.location);
    }
    weatherDetail.textContent = parts.join(" · ");
    renderWeatherPillStats(station, isLive);
    weatherPill.hidden = false;
  }

  if (!weatherCard || !weather.forecast) return;

  const forecast = weather.forecast;
  const hikingDates = new Set((forecast.hiking?.best_days || []).map(d => d.date));
  const springsDates = new Set((forecast.hot_springs?.best_days || []).map(d => d.date));

  if (weatherCardTitle) {
    weatherCardTitle.textContent = isLive ? "On-site weather" : "Outdoor weather";
  }

  setWeatherCardIcon(weather.weather_code);

  const currentEl = document.getElementById("weatherCurrent");
  if (currentEl) {
    const prefix = isLive ? "Live now" : "Now";
    currentEl.innerHTML = `${weatherIconHtml(weather.weather_code, "sm")}<span>${esc(prefix)} ${weather.temperature_f}°F · ${esc(weather.condition)}</span>`;
  }

  renderStationStats(null);

  const stayLabel = document.getElementById("weatherStayLabel");
  if (stayLabel) {
    const sourceNote = isLive ? "On-site forecast" : "Area forecast";
    const stay = config.stay;
    if (stay?.label) {
      const nights = stay.nights ? ` · ${stay.nights} night${stay.nights === 1 ? "" : "s"}` : "";
      stayLabel.textContent = `${sourceNote} for your stay (${stay.label}${nights})`;
    } else {
      stayLabel.textContent = `${sourceNote} (${forecast.stay_label || "this week"})`;
    }
  }

  const checkIn = config.stay?.check_in;
  const checkOut = config.stay?.check_out;
  const todayIso = new Date().toISOString().slice(0, 10);

  const strip = document.getElementById("forecastStrip");
  forecastDaysByDate = {};
  (forecast.days || []).forEach(day => { forecastDaysByDate[day.date] = day; });

  if (strip) {
    strip.innerHTML = (forecast.days || []).map(day => {
      const classes = ["forecast-day", "focusable"];
      if (hikingDates.has(day.date)) classes.push("forecast-day--hiking");
      if (springsDates.has(day.date)) classes.push("forecast-day--springs");
      if (day.date === todayIso) classes.push("forecast-day--today");
      if (checkIn && day.date === checkIn) classes.push("forecast-day--checkin");
      if (checkOut && day.date === checkOut) classes.push("forecast-day--checkout");
      const shortName = day.day_name.slice(0, 3);
      const [, month, dom] = day.date.split("-");
      const dateNum = `${Number(month)}/${Number(dom)}`;
      let marker = "";
      if (day.date === checkIn) marker = "In";
      else if (day.date === checkOut) marker = "Out";
      else if (day.date === todayIso) marker = "Now";
      const selected = day.date === selectedForecastDate ? "true" : "false";
      return `<button type="button" class="${classes.join(" ")}" data-date="${day.date}" tabindex="0" role="option" aria-selected="${selected}">
        <div class="forecast-day-name">${esc(shortName)} ${esc(dateNum)}</div>
        ${marker ? `<div class="forecast-day-marker">${esc(marker)}</div>` : ""}
        <div class="forecast-day-icon">${WEATHER_SVGS[weatherCodeCategory(day.weather_code)]}</div>
        <div class="forecast-day-temp">${day.high_f}°</div>
        <div class="forecast-day-low">${day.low_f}°</div>
        <div class="forecast-day-cond">${esc(shortCondition(day.condition))}</div>
      </button>`;
    }).join("");
  }

  const defaultDate = (forecast.days || []).find(d => d.date === todayIso)?.date
    || (forecast.days || [])[0]?.date;
  if (defaultDate) {
    selectForecastDay(defaultDate, false);
  } else {
    renderHourlyPanel(null);
  }

  const hikingRec = document.getElementById("hikingRec");
  if (hikingRec && forecast.hiking) {
    const top = (forecast.hiking.best_days || [])[0];
    const detail = top ? `${top.day_name}: ${top.reason}` : "";
    hikingRec.innerHTML = `
      <span class="activity-rec-label">Best for hiking</span>
      ${esc(forecast.hiking.summary || "")}
      ${detail ? `<span class="activity-rec-detail">${esc(detail)}</span>` : ""}`;
  }

  const springsRec = document.getElementById("hotSpringsRec");
  if (springsRec && forecast.hot_springs) {
    const top = (forecast.hot_springs.best_days || [])[0];
    const detail = top ? `${top.day_name}: ${top.reason}` : "";
    springsRec.innerHTML = `
      <span class="activity-rec-label">Best for hot springs</span>
      ${esc(forecast.hot_springs.summary || "")}
      ${detail ? `<span class="activity-rec-detail">${esc(detail)}</span>` : ""}`;
  }

  weatherCard.hidden = false;
  weatherCard.classList.add("focusable");
  weatherCard.tabIndex = 0;
}

function renderInfoCards(config) {
  const stack = document.getElementById("infoStack");
  if (!stack) return;
  stack.innerHTML = "";

  const welcome = config;

  const cards = [];
  const stay = config.stay;
  if (stay?.check_in || stay?.check_out) {
    const lines = [];
    if (stay.check_in) lines.push(`Check-in: ${stay.check_in_display || formatStayDate(stay.check_in)}`);
    if (stay.check_out) {
      let out = `Check-out: ${stay.check_out_display || formatStayDate(stay.check_out)}`;
      if (stay.checkout_time) out += ` by ${stay.checkout_time}`;
      lines.push(out);
    }
    if (stay.nights) lines.push(`${stay.nights} night${stay.nights === 1 ? "" : "s"} at the house`);
    const stayCard = makeInfoCard("Your stay", lines.join("\n"), "property");
    if (stayCard) cards.unshift(stayCard);
  }

  if (welcome.local_trails?.length) {
    const trailsCard = makeTrailsCard(welcome.local_trails, welcome.local_tips);
    if (trailsCard) cards.push(trailsCard);
  } else if (welcome.local_tips) {
    const tipsCard = makeInfoCard("Local recommendations", welcome.local_tips, "tips");
    if (tipsCard) cards.push(tipsCard);
  }

  const rulesCard = makeInfoCard("House rules", welcome.house_rules, "rules");
  if (rulesCard) cards.push(rulesCard);

  const property = [];
  if (welcome.thermostat_info) property.push(`Thermostat: ${welcome.thermostat_info}`);
  if (welcome.parking_info) property.push(`Parking: ${welcome.parking_info}`);
  if (welcome.trash_info) property.push(`Trash: ${welcome.trash_info}`);
  if (property.length) {
    cards.push(makeInfoCard("Property info", property.join("\n"), "property"));
  }

  const help = [welcome.emergency_name, welcome.emergency_phone].filter(Boolean).join(" · ");
  const helpCard = makeInfoCard("Need help?", help, "help");

  for (const card of cards) {
    if (card) stack.appendChild(card);
  }
  if (helpCard) stack.appendChild(helpCard);
}

function collectFocusables() {
  const nodes = [
    ...document.querySelectorAll(".top-bar-btn"),
    ...document.querySelectorAll(".cards-row .focusable:not([hidden])"),
    ...document.querySelectorAll("#forecastStrip .forecast-day"),
    ...document.querySelectorAll("#infoStack .focusable"),
    ...document.querySelectorAll(".streaming-grid .streaming-tile"),
  ];
  focusables = nodes.filter(el => el.offsetParent !== null && !el.hidden);
  bindFocusDelegation();
}

function bindFocusDelegation() {
  if (focusDelegationBound) return;
  focusDelegationBound = true;
  document.addEventListener("click", e => {
  if (detailModalOpen) {
    if (e.target.id === "btnDetailBack") {
      modalGoBack();
      return;
    }
    if (e.target.id === "btnDetailClose") {
      closeDetailModal(true);
      return;
    }
    if (e.target.id === "btnConfirmClearLogins") {
      closeDetailModal(true);
      runClearStreamingLogins();
      return;
    }
    if (e.target.id === "btnCancelClearLogins") {
      closeDetailModal(true);
      return;
    }
    const trailBtn = e.target.closest(".trail-item");
      if (trailBtn?.dataset?.trailId) {
        const trail = modalTrails.find(t => t.id === trailBtn.dataset.trailId);
        if (trail) openTrailMapModal(trail, true);
        return;
      }
      return;
    }
    const el = e.target.closest(".top-bar-btn, .focusable, .forecast-day, .streaming-tile");
    if (!el) return;
    if (isExpandableCard(el)) {
      openCardDetail(el);
      const idx = focusables.indexOf(el);
      if (idx >= 0) setFocus(idx);
      return;
    }
    if (el.classList.contains("streaming-tile") && el.dataset.package) {
      const idx = focusables.indexOf(el);
      if (idx >= 0) setFocus(idx);
      openStreamingApp(el.dataset.package);
      return;
    }
    const idx = focusables.indexOf(el);
    if (idx >= 0) setFocus(idx);
  });
  document.getElementById("btnDetailClose")?.addEventListener("click", () => closeDetailModal(true));
  document.getElementById("btnDetailBack")?.addEventListener("click", () => modalGoBack());
}

function setFocus(index) {
  if (!focusables.length) return;
  focusIndex = Math.max(0, Math.min(index, focusables.length - 1));
  focusables.forEach((el, i) => el.classList.toggle("focused", i === focusIndex));
  const current = focusables[focusIndex];
  current?.focus({ preventScroll: true });
  if (focusIndex <= 1) {
    scrollWelcomeToTop();
  } else {
    ensureFocusVisible(current);
  }
  if (isForecastDay(current) && current.dataset.date) {
    selectForecastDay(current.dataset.date, false);
  }
}

function isForecastDay(el) {
  return el?.classList?.contains("forecast-day");
}

function moveFocusHorizontal(delta) {
  const current = focusables[focusIndex];
  if (!isForecastDay(current)) {
    moveFocus(delta);
    return;
  }
  const strip = document.getElementById("forecastStrip");
  if (!strip) return;
  const days = [...strip.querySelectorAll(".forecast-day")];
  const idx = days.indexOf(current);
  const next = idx + delta;
  if (next >= 0 && next < days.length) {
    const globalIdx = focusables.indexOf(days[next]);
    if (globalIdx >= 0) setFocus(globalIdx);
    return;
  }
  moveFocus(delta);
}

function moveFocus(delta) {
  if (!focusables.length) return;
  const next = focusIndex + delta;
  if (next < 0) {
    scrollWelcomeToTop();
    setFocus(0);
    return;
  }
  if (next >= focusables.length) return;
  setFocus(next);
}

function activateFocused() {
  const current = focusables[focusIndex];
  if (!current) return;
  if (detailModalOpen) {
    if (current.id === "btnDetailClose") closeDetailModal(true);
    if (current.id === "btnDetailBack") modalGoBack();
    return;
  }
  if (current.id === "btnGoogleTv") {
    openGoogleTv();
    return;
  }
  if (current.id === "btnScrollTop") {
    scrollWelcomeToTop();
    return;
  }
  if (current.id === "btnClearLogins") {
    openClearLoginsConfirm();
    return;
  }
  if (isForecastDay(current)) {
    selectForecastDay(current.dataset.date);
    return;
  }
  if (current.classList.contains("streaming-tile") && current.dataset.package) {
    openStreamingApp(current.dataset.package);
    return;
  }
  if (isExpandableCard(current)) {
    openCardDetail(current);
    return;
  }
  current.click();
}

function publicConfigPath() {
  const propertyId = new URLSearchParams(window.location.search).get("property_id");
  if (!propertyId) return "/api/guest-welcome/public";
  return `/api/guest-welcome/public?property_id=${encodeURIComponent(propertyId)}`;
}

async function fetchPublicConfig() {
  const res = await fetch(apiUrl(publicConfigPath()), { cache: "no-store" });
  if (!res.ok) throw new Error(res.statusText || "Failed to load welcome config");
  return res.json();
}

function bindUiEvents() {
  if (uiEventsBound) return;
  uiEventsBound = true;
  document.getElementById("btnGoogleTv")?.addEventListener("click", openGoogleTv);
  document.getElementById("btnScrollTop")?.addEventListener("click", scrollWelcomeToTop);
  document.getElementById("btnClearLogins")?.addEventListener("click", openClearLoginsConfirm);
}

function applyConfig(config) {
  guestConfig = config;
  contentRevision = config.content_revision || contentRevision;

  const logo = document.getElementById("propertyLogo");
  const logoWrap = document.getElementById("propertyLogoWrap");
  const logoUrl = cachedImageUrl("logo", config.logo_url);
  if (logo && logoWrap && logoUrl) {
    logo.onload = () => {
      logoWrap.hidden = false;
      const src = (logoUrl || "").toLowerCase();
      logo.classList.toggle("property-logo--crop", /\.(jpe?g|webp)(\?|$)/.test(src));
    };
    logo.onerror = () => { logoWrap.hidden = true; };
    logo.src = logoUrl;
  } else if (logoWrap) {
    logoWrap.hidden = true;
  }

  const sceneBg = document.querySelector(".scene-bg");
  const scene = document.getElementById("scene");
  const backgroundUrl = cachedImageUrl("background", config.background_url);
  if (sceneBg && backgroundUrl) {
    sceneBg.style.backgroundImage = `url("${backgroundUrl}")`;
    sceneBg.classList.add("has-photo");
    scene?.classList.add("scene--has-photo");
  } else if (sceneBg) {
    sceneBg.style.backgroundImage = "";
    sceneBg.classList.remove("has-photo");
    scene?.classList.remove("scene--has-photo");
  }

  const guestName = (config.guest_name || "").trim();
  const titleEl = document.getElementById("title");
  const eyebrow = document.getElementById("heroEyebrow");

  titleEl.textContent = config.title || "Welcome";
  if (guestName) {
    if (eyebrow) {
      eyebrow.textContent = config.property_title || config.property_name || "Your stay at";
    }
  } else if (eyebrow) {
    eyebrow.textContent = config.property_name
      ? `Welcome to ${config.property_name}`
      : "We're glad you're here";
  }

  document.title = config.property_name
    ? `${config.title || "Welcome"} · ${config.property_name}`
    : (config.title || "Welcome");

  const subtitle = document.getElementById("subtitle");
  if (subtitle) subtitle.textContent = config.subtitle || "";

  renderStayDates(config);
  renderHeroQr(config);
  renderWeather(config);
  renderInfoCards(config);
  renderStreamingApps(config.streaming_apps || []);

  const wifiSsid = document.getElementById("wifiSsid");
  const wifiPasswordRow = document.getElementById("wifiPasswordRow");
  const wifiPassword = document.getElementById("wifiPassword");

  if (config.has_wifi_qr) {
    if (wifiSsid) wifiSsid.textContent = config.wifi_ssid || "";
    if (config.wifi_password && wifiPasswordRow && wifiPassword) {
      wifiPassword.textContent = config.wifi_password;
      wifiPasswordRow.hidden = false;
    }
  }

  const guidebookCard = document.getElementById("guidebookCard");
  if (config.has_guidebook_qr && config.guidebook_url && guidebookCard) {
    guidebookCard.hidden = false;
    document.getElementById("guidebookQr").innerHTML =
      `<img src="${apiUrl("/api/guest-welcome/guidebook-qr.png")}" alt="Guidebook QR" />`;
  } else if (guidebookCard) {
    guidebookCard.hidden = true;
  }

  bindUiEvents();
  collectFocusables();
  if (!HUB_PREVIEW && focusables.length && focusIndex === 0) setFocus(0);
}

async function loadConfig(options = {}) {
  const cached = options.forceNetwork ? null : readConfigCache();
  if (cached) applyConfig(cached);

  try {
    const config = await fetchPublicConfig();
    saveConfigCache(config);
    applyConfig(config);
    warmStaticAssets(config);
  } catch (_) {
    if (!cached) {
      const titleEl = document.getElementById("title");
      if (titleEl) titleEl.textContent = "Welcome";
      const subtitle = document.getElementById("subtitle");
      if (subtitle) {
        subtitle.textContent = cached
          ? "Showing saved property info — hub is offline"
          : "Connect to the property network to load guest information";
      }
    }
  }
}

function handleModalKeydown(e) {
  const isBack = e.key === "Escape" || e.key === "Backspace" || e.key === "BrowserBack" || e.keyCode === 4;
  if (isBack) {
    modalGoBack();
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    const active = modalFocusables[modalFocusIndex] || document.activeElement;
    if (active?.classList?.contains("trail-item")) {
      const trail = modalTrails.find(t => t.id === active.dataset.trailId);
      if (trail) openTrailMapModal(trail, true);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (active?.id === "btnDetailBack") {
      modalGoBack();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (active?.id === "btnDetailClose" || document.activeElement?.id === "btnDetailClose") {
      closeDetailModal(true);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (active?.id === "btnConfirmClearLogins") {
      closeDetailModal(true);
      runClearStreamingLogins();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (active?.id === "btnCancelClearLogins") {
      closeDetailModal(true);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    return;
  }
  if (isTrailMapView() && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    scrollModalBody(e.key === "ArrowDown" ? 72 : -72);
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (modalFocusables.length > 1) {
    if (e.key === "ArrowDown") {
      setModalFocus(modalFocusIndex + 1);
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === "ArrowUp") {
      setModalFocus(modalFocusIndex - 1);
      e.preventDefault();
      e.stopPropagation();
    } else if (isTrailMapView() && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const delta = e.key === "ArrowRight" ? 1 : -1;
      setModalFocus(modalFocusIndex + delta);
      e.preventDefault();
      e.stopPropagation();
    }
  }
}

document.addEventListener("keydown", e => {
  if (HUB_PREVIEW) return;
  if (detailModalOpen) {
    handleModalKeydown(e);
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    activateFocused();
    e.preventDefault();
    return;
  }
  if (e.key === "ArrowRight") {
    moveFocusHorizontal(1);
    e.preventDefault();
  } else if (e.key === "ArrowLeft") {
    moveFocusHorizontal(-1);
    e.preventDefault();
  } else if (e.key === "ArrowDown") {
    moveFocus(1);
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    moveFocus(-1);
    e.preventDefault();
  }
}, true);

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.dataset.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

async function bootGuestWelcome() {
  if (!HUB_PREVIEW) {
    try {
      await loadScriptOnce("/guest/js/claim-store.js");
      await loadScriptOnce("/guest/js/tv-agent-poll.js");
      const hub = hubBase();
      if (window.AatomClaimStore && !window.AatomClaimStore.isClaimed(hub)) {
        window.location.replace(`${hub}/guest/onboard/`);
        return;
      }
      const claim = window.AatomClaimStore?.loadClaim(hub);
      if (claim?.device_id && window.AatomTvAgent) {
        window.AatomTvAgent.startTvAgentPoll(claim.device_id, window.AatomClaimStore.getFingerprint());
      }
    } catch (_) {
      /* offline — show cached welcome if any */
    }
  }

  updateClock();
  setInterval(updateClock, 30000);
  loadConfig();
}

bootGuestWelcome();

async function checkForHubUpdates() {
  try {
    const config = await fetchPublicConfig();
    const rev = config.content_revision || "";
    saveConfigCache(config);
    if (contentRevision && rev && rev !== contentRevision) {
      applyConfig(config);
      warmStaticAssets(config);
      return;
    }
    contentRevision = rev || contentRevision;
    guestConfig = config;
    renderWeather(config);
    renderStreamingApps(config.streaming_apps || []);
    collectFocusables();
  } catch (_) { /* hub unreachable — cached screen stays visible */ }
}

// Pick up hub edits remotely: reload when content changes, refresh weather on the same poll.
setInterval(checkForHubUpdates, 2 * 60 * 1000);
