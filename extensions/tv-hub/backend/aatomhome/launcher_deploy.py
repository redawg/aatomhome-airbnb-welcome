"""Push guest launcher APK to ADB-connected TVs (Path 2) — no guest-account gate."""

from __future__ import annotations

import logging
from typing import Any

import adb
import guest_launcher
from guest_launcher import (
    GUEST_LAUNCHER_PACKAGE,
    get_launcher_status,
    guest_page_url,
    launch_guest_welcome,
)
from ops_logging import append_message, log_op_end, log_op_start, operation_id, step

from . import store
from .launcher_constants import (
    GUEST_LAUNCHER_PACKAGE,
    LEGACY_GUEST_LAUNCHER_PACKAGES,
    onboard_page_url,
)
from .tv_agent_ws import hub_public_url

logger = logging.getLogger("aatomhome.deploy")


async def _require_connected(device: dict) -> str:
    name = device.get("name") or device.get("host")
    host = device["host"]
    port = device["port"]
    connected, effective_port = await adb.ensure_connected(host, port)
    if not connected:
        # Dev loop: mDNS discover + reconnect (same as POST /api/registry/{id}/connect).
        try:
            result = await adb.smart_connect(host, port, None, None)
            if result.get("ok"):
                port = int(result.get("connect_port") or port)
                device["port"] = port
                connected, effective_port = await adb.ensure_connected(host, port)
        except Exception as exc:
            logger.debug("Auto ADB reconnect failed for %s: %s", name, exc)
    if not connected:
        raise ValueError(
            f"TV not connected over ADB ({host}:{port}) — "
            "Enable network debugging on the TV or run dev-push-guest-launcher.sh"
        )
    if effective_port != device["port"]:
        device["port"] = effective_port
        logger.info("ADB port updated for %s → %s:%s", name, device["host"], effective_port)
    serial = f"{device['host']}:{device['port']}"
    logger.debug("ADB connected %s serial=%s", name, serial)
    return serial


async def deploy_launcher(
    device: dict,
    *,
    hub_url: str | None = None,
    set_home: bool = True,
    launch_welcome: bool = True,
    force_reinstall: bool = True,
    start_agent: bool = True,
    auto_claim: bool = False,
) -> dict[str, Any]:
    """
    Install or update the bundled guest launcher APK on a connected TV.
    Works for Shield, Google TV, and Android TV without the guest Google account.
    """
    device_id = int(device["id"])
    device_name = device.get("name") or f"TV {device_id}"
    op_id, started = log_op_start(
        logger,
        "deploy_launcher",
        op_id=operation_id("deploy"),
        device_id=device_id,
        device_name=device_name,
    )
    messages: list[str] = []
    append_message(messages, f"Deploy launcher → {device_name}")

    try:
        serial = await _require_connected(device)
    except ValueError as exc:
        duration_ms = log_op_end(logger, op_id, "deploy_launcher", False, started, str(exc))
        return {
            "ok": False,
            "operation_id": op_id,
            "duration_ms": duration_ms,
            "device_id": device_id,
            "device_name": device_name,
            "message": str(exc),
            "messages": messages + [str(exc)],
            "steps": [step("connect_adb", False, str(exc))],
        }

    hub = (hub_url or hub_public_url()).rstrip("/")
    user_id = device.get("owner_user_id") or 0
    steps: list[dict[str, Any]] = []

    for legacy_pkg in LEGACY_GUEST_LAUNCHER_PACKAGES:
        if legacy_pkg == GUEST_LAUNCHER_PACKAGE:
            continue
        legacy_check = await adb.shell(serial, f"pm path --user {user_id} {legacy_pkg}")
        if legacy_pkg not in (legacy_check.stdout or ""):
            continue
        append_message(messages, f"Removing legacy launcher {legacy_pkg}…")
        legacy_rm = await adb.shell(serial, f"pm uninstall --user {user_id} {legacy_pkg}")
        legacy_step = step(
            "uninstall_legacy_launcher",
            legacy_rm.ok,
            legacy_rm.text() or f"Uninstalled {legacy_pkg}",
            package=legacy_pkg,
        )
        steps.append(legacy_step)
        append_message(messages, legacy_step["message"])

    status_before = await get_launcher_status(serial, user_id)
    if force_reinstall or not status_before.get("installed"):
        append_message(messages, "Installing guest launcher APK…")
        install = await guest_launcher._install_launcher(serial, user_id)
        steps.append({**install, "action": install.get("action") or "install_launcher"})
        append_message(messages, install.get("message") or ("APK install ok" if install.get("ok") else "APK install failed"))
        if not install.get("ok"):
            duration_ms = log_op_end(
                logger,
                op_id,
                "deploy_launcher",
                False,
                started,
                install.get("message") or "APK install failed",
            )
            return {
                "ok": False,
                "operation_id": op_id,
                "duration_ms": duration_ms,
                "device_id": device_id,
                "device_name": device_name,
                "serial": serial,
                "hub_url": hub,
                "steps": steps,
                "messages": messages,
                "message": install.get("message") or "APK install failed",
            }
    else:
        skip_step = step(
            "install_launcher",
            True,
            "Launcher already installed — use force_reinstall to push a new APK build",
            skipped=True,
        )
        steps.append(skip_step)
        append_message(messages, skip_step["message"])

    if set_home:
        append_message(messages, "Setting guest launcher as home activity…")
        home = await guest_launcher._set_launcher_home(serial, user_id)
        home_step = {**home, "action": home.get("action") or "set_home", "user_id": user_id}
        steps.append(home_step)
        append_message(messages, home.get("message") or ("Home set" if home.get("ok") else "Set home failed"))
        if not home.get("ok"):
            manual = step(
                "set_home_manual",
                True,
                "On the TV: press Home → choose Guest Welcome → Always",
            )
            steps.append(manual)
            append_message(messages, manual["message"])

    if auto_claim:
        meta = await store.ensure_meta_for_device(device_id)
        await store.upsert_meta(
            device_id,
            registration_status="claimed",
            pending_approval=0,
        )
        claim_step = step(
            "hub_claim",
            True,
            f"Hub slot bound (room code {meta.get('claim_code') or '—'})",
            claim_code=meta.get("claim_code"),
        )
        steps.append(claim_step)
        append_message(messages, claim_step["message"])

    launch: dict[str, Any]
    if launch_welcome:
        meta = await store.get_meta(device_id)
        reg = (meta.get("registration_status") or "active").strip()
        fingerprint = (meta.get("device_fingerprint") or "").strip()
        hub_claimed = reg in ("claimed", "active") and bool(fingerprint)
        if hub_claimed:
            launch_url = guest_page_url(hub)
            append_message(
                messages,
                f"Room claimed — opening guest dashboard at {launch_url}",
            )
        elif force_reinstall:
            launch_url = f"{onboard_page_url(hub).rstrip('/')}/?reprovision=1"
            append_message(messages, f"Fresh setup — opening {launch_url}")
        else:
            launch_url = onboard_page_url(hub)
            append_message(messages, f"Opening TV setup at {launch_url}…")
        onboard_url = launch_url
        launch = await launch_guest_welcome(
            serial, user_id, hub, force=True, page_url=onboard_url
        )
        steps.append({**launch, "action": launch.get("action") or "launch_onboard"})
        append_message(
            messages,
            launch.get("message") or ("Setup screen opened" if launch.get("ok") else "Launch failed"),
        )
    else:
        launch = {"ok": True, "skipped": True, "action": "launch_welcome"}
        steps.append(launch)

    if start_agent and launch_welcome:
        agent_steps = await guest_launcher._allow_auto_start(serial, user_id)
        for agent_step in agent_steps:
            steps.append({**agent_step, "action": agent_step.get("action") or "tv_agent_pref"})
        steps.append(step(
            "tv_agent",
            True,
            "Launcher started — TV agent polls hub when app is in foreground",
        ))
        append_message(messages, "TV agent enabled for hub polling")

    status = await get_launcher_status(serial, user_id)
    failed = [s for s in steps if not s.get("ok", True) and not s.get("skipped")]
    ok = not failed and (launch.get("ok", True) if launch_welcome else True)

    manual: list[str] = []
    if not status.get("is_default_home"):
        manual.append("Press Home on the TV → Guest Welcome → Always")
    if not status.get("installed"):
        manual.append("APK install may have failed — check steps and retry Update launcher APK")

    if manual:
        append_message(messages, "Manual: " + "; ".join(manual))

    summary = (
        "Welcome app pushed — launcher installed and welcome opened"
        if ok and launch_welcome
        else "Launcher APK updated on TV"
        if ok and not launch_welcome
        else "Deploy incomplete — see steps"
    )
    duration_ms = log_op_end(
        logger,
        op_id,
        "deploy_launcher",
        ok,
        started,
        summary,
        device_id=device_id,
        failed_steps=len(failed),
    )
    return {
        "ok": ok,
        "operation_id": op_id,
        "duration_ms": duration_ms,
        "device_id": device_id,
        "device_name": device_name,
        "serial": serial,
        "hub_url": hub,
        "guest_page_url": guest_page_url(hub),
        "onboard_page_url": onboard_page_url(hub),
        "launcher": status,
        "apk_package": GUEST_LAUNCHER_PACKAGE,
        "steps": steps,
        "messages": messages,
        "manual_steps": manual,
        "message": summary,
    }


async def deploy_launcher_bulk(
    devices: list[dict],
    *,
    hub_url: str | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    op_id, started = log_op_start(
        logger,
        "deploy_launcher_bulk",
        op_id=operation_id("bulk-deploy"),
        device_count=len(devices),
    )
    messages: list[str] = [f"Bulk launcher deploy — {len(devices)} TV(s)"]
    results: list[dict[str, Any]] = []

    for device in devices:
        name = device.get("name") or device.get("host")
        append_message(messages, f"→ {name}")
        try:
            result = await deploy_launcher(device, hub_url=hub_url, **kwargs)
        except ValueError as exc:
            logger.warning("[%s] %s skipped: %s", op_id, name, exc)
            result = {
                "ok": False,
                "device_id": device.get("id"),
                "device_name": name,
                "skipped": True,
                "message": str(exc),
                "messages": [str(exc)],
            }
        except Exception as exc:
            logger.exception("[%s] deploy failed for %s", op_id, name)
            result = {
                "ok": False,
                "device_id": device.get("id"),
                "device_name": name,
                "message": str(exc),
                "messages": [str(exc)],
            }
        result["device_name"] = name
        results.append(result)
        append_message(messages, result.get("message") or ("ok" if result.get("ok") else "failed"))

    synced = sum(1 for r in results if r.get("ok"))
    failed = sum(1 for r in results if not r.get("ok") and not r.get("skipped"))
    skipped = sum(1 for r in results if r.get("skipped"))
    summary = (
        f"Pushed welcome app to {synced} TV(s)"
        + (f"; {skipped} offline" if skipped else "")
        + (f"; {failed} failed" if failed else "")
    )
    duration_ms = log_op_end(
        logger,
        op_id,
        "deploy_launcher_bulk",
        failed == 0,
        started,
        summary,
        synced=synced,
        failed=failed,
        skipped=skipped,
    )
    return {
        "ok": failed == 0,
        "operation_id": op_id,
        "duration_ms": duration_ms,
        "synced": synced,
        "failed": failed,
        "skipped": skipped,
        "results": results,
        "messages": messages,
        "message": summary,
    }
