# Upstream: adb-tv-hub

This project evolves from **[redawg/adb-tv-hub](https://github.com/redawg/adb-tv-hub)** at a pinned production tag.

## Baseline tag

```
cdo-production-2026-09-11
```

Commit `83da484` — baseline deployment with connect-all, live welcome preview, TV clear-logins, ADB port discovery fixes.

## When forking tv-hub code

```bash
git clone https://github.com/redawg/adb-tv-hub.git /tmp/adb-tv-hub-upstream
cd /tmp/adb-tv-hub-upstream
git checkout cdo-production-2026-09-11
# Copy into aatomhome-airbnb-welcome/tv-hub/ when starting Phase 2
```

Cherry-pick bugfixes from `adb-tv-hub` `main` into this repo as needed; do **not** merge room-control experiments back into legacy production without explicit review.

## legacy production host

- URL: http://192.168.2.1:8080
- Image: `localhost/adb-tv-hub:latest` on hub host
- Data: Podman volume `adb-tv-hub-data`

Leave this stack on the pinned tag until aatomhome pilot is validated.
