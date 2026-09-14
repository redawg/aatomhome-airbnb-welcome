"""Claim, self-register, room-config, and pending-device APIs."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import database as db
from ops_logging import append_message, log_op_end, log_op_start, operation_id

from . import store
from .activity_log import note_agent_poll, record_activity
from .device_auth import issue_session_token
from .launcher_deploy import deploy_launcher, deploy_launcher_bulk
from .tv_agent_ws import (
    dispatch_clear_streaming,
    dispatch_enable_adb,
    hub_public_url,
    poll_agent_command,
    submit_agent_result,
)

logger = logging.getLogger("aatomhome.registry")
router = APIRouter(tags=["aatomhome"])


class RoomConfigBody(BaseModel):
    room_name: str = ""
    welcome_overrides: dict[str, Any] = Field(default_factory=dict)
    controls: list[dict[str, Any]] = Field(default_factory=list)
    dashboard_mode: str = Field(
        default="cdo_str",
        description="cdo_str | ha_dashboard",
    )
    ha_dashboard_url: str = Field(
        default="",
        description="Optional HA Lovelace dashboard URL for ha_dashboard mode",
    )


class ClaimBody(BaseModel):
    claim_code: str
    device_fingerprint: str | None = None
    hub_url: str | None = None


class SelfRegisterBody(BaseModel):
    host: str
    name: str | None = None
    port: int = 5555
    device_fingerprint: str | None = None
    product_model: str | None = None
    pairing_code: str | None = None
    property_id: int = 1


class DeployLauncherBody(BaseModel):
    """Path 2 — push bundled welcome APK over ADB to a connected TV."""
    set_home: bool = True
    launch_welcome: bool = True
    force_reinstall: bool = True
    start_agent: bool = True
    auto_claim: bool = False


class DeployLauncherBulkBody(BaseModel):
    set_home: bool = True
    launch_welcome: bool = True
    force_reinstall: bool = True
    start_agent: bool = True
    auto_claim: bool = False
    online_only: bool = True


class AppSlotBody(BaseModel):
    """Path 1 — staff creates a room slot before the TV installs the launcher app."""
    name: str = Field(..., min_length=1, max_length=120)
    property_id: int = Field(default=1, ge=1)
    notes: str | None = Field(
        default=None,
        description="Optional label, e.g. Living room — app download path",
    )


def _client_host(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


@router.get("/api/aatomhome/health")
async def aatomhome_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "extensions": "aatomhome",
        "hub_public_url": hub_public_url(),
    }


@router.post("/api/aatomhome/registry/{device_id}/deploy-launcher")
async def registry_deploy_launcher(device_id: int, body: DeployLauncherBody | None = None) -> dict[str, Any]:
    """Install or update the guest launcher APK on a paired, ADB-connected TV."""
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    req = body or DeployLauncherBody()
    logger.info(
        "deploy-launcher request device_id=%s name=%s force_reinstall=%s launch=%s",
        device_id,
        device.get("name"),
        req.force_reinstall,
        req.launch_welcome,
    )
    try:
        result = await deploy_launcher(
            device,
            set_home=req.set_home,
            launch_welcome=req.launch_welcome,
            force_reinstall=req.force_reinstall,
            start_agent=req.start_agent,
            auto_claim=req.auto_claim,
        )
    except ValueError as exc:
        logger.warning("deploy-launcher rejected device_id=%s: %s", device_id, exc)
        raise HTTPException(503, str(exc))
    if req.launch_welcome and result.get("ok"):
        import device_detection

        try:
            await device_detection.refresh_device_profile(device, result["serial"])
        except Exception:
            logger.exception("Device profile refresh after deploy for %s", device.get("name"))
    updated = await db.get_device(device_id)
    if updated and result.get("serial"):
        host, port_str = result["serial"].rsplit(":", 1)
        if updated.get("host") != host or str(updated.get("port")) != port_str:
            await db.update_device(device_id, host=host, port=int(port_str))
            updated = await db.get_device(device_id)
    result["device"] = updated
    return result


@router.post("/api/aatomhome/registry/deploy-launcher")
async def registry_deploy_launcher_bulk(body: DeployLauncherBulkBody | None = None) -> dict[str, Any]:
    """Push welcome launcher APK to every registered TV (online only by default)."""
    req = body or DeployLauncherBulkBody()
    devices = await db.list_devices()
    if req.online_only:
        devices = [d for d in devices if d.get("connection_state") == "device"]
    if not devices:
        raise HTTPException(404, "No ADB-connected TVs — connect a TV first")
    logger.info(
        "deploy-launcher bulk count=%s online_only=%s",
        len(devices),
        req.online_only,
    )
    return await deploy_launcher_bulk(
        devices,
        set_home=req.set_home,
        launch_welcome=req.launch_welcome,
        force_reinstall=req.force_reinstall,
        start_agent=req.start_agent,
        auto_claim=req.auto_claim,
    )


@router.post("/api/aatomhome/registry/app-slot")
async def create_app_slot(body: AppSlotBody) -> dict[str, Any]:
    """Path 1 — room slot for download-and-claim (no ADB / dev options on TV)."""
    device_id = await db.create_device(
        name=body.name.strip(),
        host="0.0.0.0",
        port=5555,
        notes=(body.notes or "app-download").strip(),
        auto_provision=False,
    )
    if body.property_id and body.property_id != 1:
        await db.update_device(device_id, property_id=body.property_id)
    meta = await store.ensure_meta_for_device(device_id)
    await store.set_room_config(device_id, {"room_name": body.name.strip()})
    device = await db.get_device(device_id)
    return {
        "ok": True,
        "provision_mode": "app",
        "device_id": device_id,
        "device": device,
        "claim_code": meta.get("claim_code"),
        "hub_public_url": hub_public_url(),
        "message": "Room slot created — install the launcher on the TV, enter the hub URL, then use this room code.",
    }


@router.post("/api/registry/{device_id}/prepare-claim")
async def prepare_claim(device_id: int) -> dict[str, Any]:
    """Staff creates a TV slot and gets a claim code for the guest launcher."""
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    meta = await store.ensure_meta_for_device(device_id)
    return {
        "ok": True,
        "device_id": device_id,
        "claim_code": meta.get("claim_code"),
        "hub_public_url": hub_public_url(),
    }


@router.post("/api/registry/{device_id}/regenerate-claim")
async def regenerate_claim(device_id: int) -> dict[str, Any]:
    """New room code — clears fingerprint so the TV can claim again (re-provision)."""
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    meta = await store.regenerate_claim_code(device_id)
    # Path 1 app slots only — clear placeholder host. Keep staff-registered ADB IPs (Path 2).
    prior_host = (device.get("host") or "").strip()
    if prior_host in ("", "0.0.0.0", "pending"):
        await db.update_device(device_id, host="0.0.0.0", port=5555)
    logger.info(
        "regenerate-claim device_id=%s name=%s new_code=%s",
        device_id,
        device.get("name"),
        meta.get("claim_code"),
    )
    await record_activity(
        level="info",
        category="setup",
        message=f"New room code issued — {device.get('name') or f'TV {device_id}'}",
        device_id=device_id,
        device_name=device.get("name"),
        details=f"Code {meta.get('claim_code')}",
    )
    return {
        "ok": True,
        "device_id": device_id,
        "device_name": device.get("name"),
        "claim_code": meta.get("claim_code"),
        "registration_status": meta.get("registration_status", "unclaimed"),
        "hub_public_url": hub_public_url(),
        "message": "New room code issued — enter it on the TV onboarding screen.",
    }


@router.get("/api/registry/{device_id}/room-config")
async def get_room_config(device_id: int) -> dict[str, Any]:
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    await store.ensure_meta_for_device(device_id)
    config = await store.get_room_config(device_id)
    meta = await store.get_meta(device_id)
    return {
        "device_id": device_id,
        "room_config": config,
        "claim_code": meta.get("claim_code"),
        "registration_status": meta.get("registration_status", "active"),
        "agent_connected": bool(meta.get("agent_connected")),
    }


@router.put("/api/registry/{device_id}/room-config")
async def put_room_config(device_id: int, body: RoomConfigBody) -> dict[str, Any]:
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    incoming = body.model_dump()
    existing = await store.get_room_config(device_id)
    merged = await store.set_room_config(device_id, {**existing, **incoming})
    room_name = (merged.get("room_name") or "").strip()
    if room_name:
        await db.update_device(device_id, name=room_name)
    return {"device_id": device_id, "room_config": merged, "ok": True}


@router.get("/api/registry/device-status")
async def device_status(fingerprint: str) -> dict[str, Any]:
    """TV onboarding — check whether this device fingerprint is already claimed."""
    meta = await store.find_by_fingerprint(fingerprint)
    if not meta:
        await record_activity(
            level="info",
            category="tv-app",
            message="TV checked claim status — not registered",
            details=f"fingerprint {fingerprint[:16]}…",
            throttle_key=f"device-status:unclaimed:{fingerprint[:24]}",
            throttle_seconds=300,
        )
        return {"claimed": False}
    device_id = int(meta["device_id"])
    device = await db.get_device(device_id)
    status = meta.get("registration_status") or "active"
    if status in ("claimed", "active"):
        await record_activity(
            level="info",
            category="tv-app",
            message=f"TV verified session — {device.get('name') if device else f'TV {device_id}'}",
            device_id=device_id,
            device_name=device.get("name") if device else None,
            throttle_key=f"device-status:claimed:{device_id}",
            throttle_seconds=180,
        )
    return {
        "claimed": status in ("claimed", "active"),
        "device_id": device_id,
        "claim_code": meta.get("claim_code"),
        "registration_status": status,
        "room_config": await store.get_room_config(device_id),
        "agent_connected": bool(meta.get("agent_connected")),
        "hub_public_url": hub_public_url(),
    }


@router.post("/api/registry/claim-by-code")
async def claim_by_code(body: ClaimBody, request: Request) -> dict[str, Any]:
    """Flow C — TV enters claim code; hub binds fingerprint to the pre-created slot."""
    meta = await store.find_by_claim_code(body.claim_code)
    if not meta:
        code = body.claim_code.strip().upper()
        await record_activity(
            level="error",
            category="tv-app",
            message=f"Invalid room code — {code}",
            details=f"fingerprint {(body.device_fingerprint or '')[:16]}",
        )
        raise HTTPException(404, "Invalid claim code")
    device_id = int(meta["device_id"])
    return await claim_device(device_id, body, request)


@router.post("/api/registry/{device_id}/claim")
async def claim_device(device_id: int, body: ClaimBody, request: Request) -> dict[str, Any]:
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    meta = await store.get_meta(device_id)
    expected = (meta.get("claim_code") or "").strip().upper()
    provided = body.claim_code.strip().upper()
    if not expected or provided != expected:
        await record_activity(
            level="error",
            category="tv-app",
            message=f"Claim rejected — wrong code for {device.get('name') or f'TV {device_id}'}",
            device_id=device_id,
            device_name=device.get("name"),
            details=f"provided {provided}",
        )
        raise HTTPException(400, "Invalid claim code")
    fingerprint = body.device_fingerprint or _client_host(request)
    host = _client_host(request)
    current_host = (device.get("host") or "").strip()
    # Path 1 slots start at 0.0.0.0 — bind the TV's LAN IP on first claim only.
    # Never overwrite a staff-registered ADB host (Path 2) with the HTTP client IP.
    if host and current_host in ("", "0.0.0.0", "pending"):
        await db.update_device(device_id, host=host)
        device = await db.get_device(device_id)
    elif host and current_host and host != current_host:
        logger.info(
            "claim_device device_id=%s keeping host %s (claim HTTP client was %s)",
            device_id,
            current_host,
            host,
        )
    session_token, session_hash = issue_session_token()
    await store.upsert_meta(
        device_id,
        device_fingerprint=fingerprint,
        registration_status="claimed",
        pending_approval=0,
        device_session_hash=session_hash,
    )
    if body.hub_url:
        pass  # TV stores hub_url locally; hub echoes canonical URL
    room_config = await store.get_room_config(device_id)
    room_name = (room_config.get("room_name") or device.get("name") or "").strip()
    fp_short = (fingerprint or "")[:16]
    await record_activity(
        level="success",
        category="tv-app",
        message=f"Room claimed — {room_name or device.get('name') or f'TV {device_id}'}",
        device_id=device_id,
        device_name=device.get("name"),
        details=f"Code {provided}" + (f" · fingerprint {fp_short}…" if fp_short else ""),
    )
    return {
        "ok": True,
        "device_id": device_id,
        "device_session": session_token,
        "hub_public_url": hub_public_url(),
        "room_config": room_config,
    }


@router.post("/api/registry/self-register")
async def self_register(body: SelfRegisterBody) -> dict[str, Any]:
    host = body.host.strip()
    if not host:
        raise HTTPException(400, "host is required")
    existing = await db.get_device_by_host(host)
    if existing:
        meta = await store.get_meta(existing["id"])
        if not meta:
            await store.upsert_meta(existing["id"])
            meta = await store.get_meta(existing["id"])
        await record_activity(
            level="info",
            category="tv-app",
            message=f"TV self-register — already known ({existing.get('name') or host})",
            device_id=existing["id"],
            device_name=existing.get("name"),
            details=f"host {host}",
            throttle_key=f"self-register:{existing['id']}",
            throttle_seconds=300,
        )
        return {
            "ok": True,
            "status": "already_registered",
            "device_id": existing["id"],
            "claim_code": meta.get("claim_code"),
            "hub_public_url": hub_public_url(),
        }
    pending = await store.create_pending_device(
        host=host,
        name=body.name,
        port=body.port,
        device_fingerprint=body.device_fingerprint,
        product_model=body.product_model,
        pairing_code=body.pairing_code,
        property_id=body.property_id,
    )
    await record_activity(
        level="info",
        category="tv-app",
        message=f"TV self-register — pending approval ({body.name or host})",
        details=f"host {host} · code {pending.get('claim_code')}",
    )
    return {
        "ok": True,
        "status": "pending",
        "pending_id": pending["id"],
        "claim_code": pending.get("claim_code"),
        "pairing_code": pending.get("pairing_code"),
        "hub_public_url": hub_public_url(),
    }


@router.get("/api/registry/pending")
async def list_pending() -> list[dict[str, Any]]:
    return await store.list_pending_devices()


@router.post("/api/registry/pending/{pending_id}/approve")
async def approve_pending(pending_id: int) -> dict[str, Any]:
    try:
        result = await store.approve_pending_device(pending_id, db)
    except ValueError:
        raise HTTPException(404, "Pending device not found")
    device_id = result["device_id"]
    await store.upsert_meta(device_id, registration_status="active", pending_approval=0)
    return {"ok": True, **result}


class AgentPollBody(BaseModel):
    device_fingerprint: str | None = None
    local_ip: str | None = None
    wifi_ssid: str | None = None


class AgentResultBody(BaseModel):
    command: str
    ok: bool = True
    error: str | None = None
    cleared: list[str] = Field(default_factory=list)
    adb_setup_status: str | None = None
    adb_setup_message: str | None = None
    local_ip: str | None = None
    wifi_ssid: str | None = None


async def _apply_tv_local_ip(device_id: int, local_ip: str | None) -> None:
    ip = (local_ip or "").strip()
    if not ip:
        return
    device = await db.get_device(device_id)
    if not device:
        return
    host = (device.get("host") or "").strip()
    if host in ("", "0.0.0.0", "pending"):
        await db.update_device(device_id, host=ip, port=5555)
    await store.update_tv_agent_meta(device_id, local_ip=ip)


@router.post("/api/tv-agent/{device_id}/poll")
async def tv_agent_poll(device_id: int, body: AgentPollBody | None = None) -> dict[str, Any]:
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    if body and body.device_fingerprint:
        await store.upsert_meta(device_id, device_fingerprint=body.device_fingerprint)
    if body and body.local_ip:
        await _apply_tv_local_ip(device_id, body.local_ip)
    if body and body.wifi_ssid:
        ssid = body.wifi_ssid.strip().strip('"')
        if ssid and ssid.lower() not in ("<unknown ssid>", "unknown", "null"):
            await store.update_tv_agent_meta(device_id, wifi_ssid=ssid)
    await store.set_agent_connected(device_id, True)
    await note_agent_poll(device_id, device.get("name"))
    command = await poll_agent_command(device_id, timeout=20.0)
    if command is None:
        return {"ok": True, "command": None}
    return {"ok": True, **command}


@router.post("/api/tv-agent/{device_id}/result")
async def tv_agent_result(device_id: int, body: AgentResultBody) -> dict[str, Any]:
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    if body.command == "enable_adb":
        status = body.adb_setup_status or ("complete" if body.ok else "failed")
        await store.update_tv_agent_meta(
            device_id,
            adb_setup_status=status,
            adb_setup_message=body.adb_setup_message or body.error,
            local_ip=body.local_ip,
        )
        if body.local_ip:
            await _apply_tv_local_ip(device_id, body.local_ip)
        await record_activity(
            level="info" if body.ok else "warn",
            category="tv-app",
            message=f"ADB setup {status} — {device.get('name') or f'TV {device_id}'}",
            device_id=device_id,
            device_name=device.get("name"),
            details=body.adb_setup_message or body.error,
        )
    await submit_agent_result(
        device_id,
        {
            "type": "command_result",
            "command": body.command,
            "ok": body.ok,
            "error": body.error,
            "cleared": body.cleared,
            "adb_setup_status": body.adb_setup_status,
            "local_ip": body.local_ip,
        },
    )
    return {"ok": True}


@router.post("/api/registry/{device_id}/request-adb-enable")
async def request_adb_enable(device_id: int) -> dict[str, Any]:
    """Path 1 → Path 2: ask the installed guest app to open the wireless-debugging wizard."""
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    meta = await store.get_meta(device_id)
    reg = meta.get("registration_status") or "active"
    if reg not in ("claimed", "active") and not meta.get("device_fingerprint"):
        raise HTTPException(400, "TV must claim the room before remote ADB setup")
    if not meta.get("agent_connected"):
        raise HTTPException(
            409,
            "Guest app is offline — open Guest Welcome on the TV first",
        )
    await store.update_tv_agent_meta(
        device_id,
        adb_setup_status="requested",
        adb_setup_message="Hub requested wireless debugging setup",
    )
    result = await dispatch_enable_adb(device_id)
    await record_activity(
        level="info",
        category="setup",
        message=f"Remote ADB setup requested — {device.get('name') or f'TV {device_id}'}",
        device_id=device_id,
        device_name=device.get("name"),
    )
    return {
        "ok": True,
        "queued": result.get("queued", True),
        "device_id": device_id,
        "message": "Follow the prompts on the TV to enable Developer options and Wireless debugging.",
    }


@router.post("/api/aatomhome/registry/{device_id}/clear-streaming-logins")
async def clear_streaming_via_agent(device_id: int) -> dict[str, Any]:
    """Try TV agent WebSocket first; fall back to hub ADB."""
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")

    device_name = device.get("name") or f"TV {device_id}"
    op_id, started = log_op_start(
        logger,
        "clear_streaming",
        op_id=operation_id("clear"),
        device_id=device_id,
        device_name=device_name,
    )
    messages: list[str] = [f"Clear streaming logins → {device_name}"]

    append_message(messages, "Trying TV agent (WebSocket / HTTP poll)…")
    agent_result = await dispatch_clear_streaming(device_id)
    if agent_result.get("ok"):
        cleared = agent_result.get("cleared") or []
        append_message(messages, f"TV agent cleared {len(cleared)} app(s)")
        if agent_result.get("error"):
            append_message(messages, f"Agent note: {agent_result['error']}")
        duration_ms = log_op_end(
            logger,
            op_id,
            "clear_streaming",
            True,
            started,
            f"via tv_agent — {len(cleared)} cleared",
            device_id=device_id,
        )
        return {
            "ok": True,
            "via": "tv_agent",
            "operation_id": op_id,
            "duration_ms": duration_ms,
            "device_id": device_id,
            "device_name": device_name,
            "messages": messages,
            **agent_result,
        }

    agent_err = agent_result.get("error") or "agent unavailable"
    append_message(messages, f"TV agent failed ({agent_err}) — falling back to ADB")
    logger.info("[%s] agent clear failed for %s: %s — ADB fallback", op_id, device_name, agent_err)

    import guest_profile
    import adb

    connected, effective_port = await adb.ensure_connected(device["host"], device["port"])
    if not connected:
        duration_ms = log_op_end(
            logger,
            op_id,
            "clear_streaming",
            False,
            started,
            "TV offline",
            device_id=device_id,
        )
        msg = f"{device_name}: not connected over ADB"
        raise HTTPException(503, msg)

    if effective_port != device["port"]:
        device["port"] = effective_port
    serial = f"{device['host']}:{device['port']}"
    owner_id = device.get("owner_user_id") or guest_profile.MAIN_USER_ID
    append_message(messages, f"ADB connected {serial} — clearing packages on user {owner_id}")
    adb_result = await guest_profile.clear_streaming_logins(serial, [owner_id])
    messages.extend(adb_result.get("messages") or [])
    ok = bool(adb_result.get("ok"))
    duration_ms = log_op_end(
        logger,
        op_id,
        "clear_streaming",
        ok,
        started,
        adb_result.get("message") or "ADB clear complete",
        device_id=device_id,
        via="adb",
    )
    return {
        "ok": ok,
        "via": "adb",
        "operation_id": op_id,
        "duration_ms": duration_ms,
        "device_id": device_id,
        "device_name": device_name,
        "messages": messages,
        **adb_result,
    }
