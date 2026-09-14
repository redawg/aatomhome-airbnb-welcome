/**
 * TV display bootstrap — run synchronously in <head> before CSS.
 * Uses GuestLauncher.getDisplayMetrics() when the APK shell is present,
 * otherwise window.screen / devicePixelRatio. Sets --ui-scale for 10-foot UI.
 */
(function () {
  const DESIGN_W = 1920;
  const DESIGN_H = 1080;

  function readNativeMetrics() {
    try {
      if (typeof GuestLauncher !== "undefined" && GuestLauncher.getDisplayMetrics) {
        const raw = GuestLauncher.getDisplayMetrics();
        const m = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (m && m.widthCssPx > 0 && m.heightCssPx > 0) {
          return {
            w: m.widthCssPx,
            h: m.heightCssPx,
            dpr: m.density || window.devicePixelRatio || 1,
            physicalW: m.widthPx || m.widthCssPx,
            physicalH: m.heightPx || m.heightCssPx,
            source: "launcher",
          };
        }
      }
    } catch (_) {
      /* bridge unavailable */
    }

    const w = window.screen?.width || window.innerWidth || DESIGN_W;
    const h = window.screen?.height || window.innerHeight || DESIGN_H;
    const dpr = window.devicePixelRatio || 1;
    return {
      w,
      h,
      dpr,
      physicalW: Math.round(w * dpr),
      physicalH: Math.round(h * dpr),
      source: "screen",
    };
  }

  function applyDisplay(metrics) {
    const scale = Math.min(metrics.w / DESIGN_W, metrics.h / DESIGN_H);
    const root = document.documentElement;
    root.style.setProperty("--design-width", String(DESIGN_W));
    root.style.setProperty("--design-height", String(DESIGN_H));
    root.style.setProperty("--tv-width", String(metrics.w));
    root.style.setProperty("--tv-height", String(metrics.h));
    root.style.setProperty("--dpr", String(metrics.dpr));
    root.style.setProperty("--ui-scale", String(scale));
    root.dataset.tvDisplay = `${metrics.w}x${metrics.h}@${metrics.dpr}`;
    root.dataset.tvDisplaySource = metrics.source;

    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
      vp = document.createElement("meta");
      vp.setAttribute("name", "viewport");
      document.head.appendChild(vp);
    }
    vp.setAttribute(
      "content",
      `width=${metrics.w}, height=${metrics.h}, initial-scale=1, viewport-fit=cover`,
    );
  }

  const metrics = readNativeMetrics();
  applyDisplay(metrics);

  window.AatomTvDisplay = {
    design: { width: DESIGN_W, height: DESIGN_H },
    metrics,
    refresh() {
      const next = readNativeMetrics();
      applyDisplay(next);
      Object.assign(this.metrics, next);
      return next;
    },
  };
})();
