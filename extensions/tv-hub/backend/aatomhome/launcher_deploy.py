"""Push guest launcher APK to ADB-connected TVs (Path 2) — no CDO guest-account gate."""

from __future__ import annotations

from typing import Any

import adb
import guest_launcher
from guest_launcher import (
    GUEST_LAUNCHER_PACKAGE,
    get_launcher_status,
    guest_page_url,
    launch_guest_welcome,
)

from . import store
from .tv_agent_ws import hub_public_url


async def _require_connected(device: dict) -> str:
    connected, effective_port = await adb.ensure_connected(device["host"], device["port"])
    if not connected:
        raise ValueError(
            f"TV not connected over ADB ({device.get('host')}:{device.get('port')}) — "
            "Connect first, then push the welcome app."
        )
    if effective_port != device["port"]:
        device["port"] = effective_port
    return f"{device['host']}:{device['port']}"


async def deploy_launcher(
    device: dict,
    *,
    hub_url: str | None = None,
    set_home: bool = True,
    launch_welcome: bool = True,
    force_reinstall: bool = True,
    start_agent: bool = True,
    auto_claim: bool = True,
) -> dict[str, Any]:
    """
    Install or update the bundled guest launcher APK on a connected TV.
    Works for Shield, Google TV, and Android TV without the CDO guest Google account.
    """
    device_id = int(device["id"])
    serial = await _require_connected(device)
    hub = (hub_url or hub_public_url()).rstrip("/")
    user_id = device.get("owner_user_id") or 0
    steps: list[dict[str, Any]] = []

    status_before = await get_launcher_status(serial, user_id)
    if force_reinstall or not status_before.get("installed"):
        install = await guest_launcher._install_launcher(serial, user_id)
        steps.append(install)
        if not install.get("ok"):
            return {
                "ok": False,
                "device_id": device_id,
                "serial": serial,
                "hub_url": hub,
                "steps": steps,
                "message": install.get("message") or "APK install failed",
            }
    else:
        steps.append({
            "ok": True,
            "action": "install_launcher",
            "skipped": True,
            "message": "Launcher already installed — use force_reinstall to push a new APK build",
        })

    if set_home:
        home = await guest_launcher._set_launcher_home(serial, user_id)
        steps.append({**home, "user_id": user_id})
        if not home.get("ok"):
            steps.append({
                "ok": True,
                "action": "set_home_manual",
                "message": "On the TV: press Home → choose Guest Welcome → Always",
            })

    if auto_claim:
        meta = await store.ensure_meta_for_device(device_id)
        await store.upsert_meta(
            device_id,
            registration_status="claimed",
            pending_approval=0,
        )
        steps.append({
            "ok": True,
            "action": "hub_claim",
            "message": f"Hub slot bound (room code {meta.get('claim_code') or '—'})",
            "claim_code": meta.get("claim_code"),
        })

    if launch_welcome:
        launch = await launch_guest_welcome(serial, user_id, hub, force=True)
        steps.append(launch)
    else:
        launch = {"ok": True, "skipped": True, "action": "launch_welcome"}

    if start_agent and launch_welcome:
        agent = await guest_launcher._allow_auto_start(serial, user_id)
        steps.extend(agent)
        steps.append({
            "ok": True,
            "action": "tv_agent",
            "message": "Launcher started — TV agent polls hub when app is in foreground",
        })

    status = await get_launcher_status(serial, user_id)
    failed = [s for s in steps if not s.get("ok", True) and not s.get("skipped")]
    ok = not failed and (launch.get("ok", True) if launch_welcome else True)

    manual: list[str] = []
    if not status.get("is_default_home"):
        manual.append("Press Home on the TV → Guest Welcome → Always")
    if not status.get("installed"):
        manual.append("APK install may have failed — check steps and retry Update launcher APK")

    return {
        "ok": ok,
        "device_id": device_id,
        "serial": serial,
        "hub_url": hub,
        "guest_page_url": guest_page_url(hub),
        "launcher": status,
        "apk_package": GUEST_LAUNCHER_PACKAGE,
        "steps": steps,
        "manual_steps": manual,
        "message": (
            "Welcome app pushed — launcher installed and welcome opened"
            if ok and launch_welcome
            else "Launcher APK updated on TV"
            if ok and not launch_welcome
            else "Deploy incomplete — see steps"
        ),
    }


async def deploy_launcher_bulk(
    devices: list[dict],
    *,
    hub_url: str | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    for device in devices:
        name = device.get("name") or device.get("host")
        try:
            result = await deploy_launcher(device, hub_url=hub_url, **kwargs)
        except ValueError as exc:
            result = {
                "ok": False,
                "device_id": device.get("id"),
                "device_name": name,
                "skipped": True,
                "message": str(exc),
            }
        except Exception as exc:
            result = {
                "ok": False,
                "device_id": device.get("id"),
                "device_name": name,
                "message": str(exc),
            }
        result["device_name"] = name
        results.append(result)

    synced = sum(1 for r in results if r.get("ok"))
    failed = sum(1 for r in results if not r.get("ok") and not r.get("skipped"))
    skipped = sum(1 for r in results if r.get("skipped"))
    return {
        "ok": failed == 0,
        "synced": synced,
        "failed": failed,
        "skipped": skipped,
        "results": results,
        "message": f"Pushed welcome app to {synced} TV(s)"
        + (f"; {skipped} offline" if skipped else "")
        + (f"; {failed} failed" if failed else ""),
    }
