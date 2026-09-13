"""Claim, self-register, room-config, and pending-device APIs."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import database as db
from . import store
from .launcher_deploy import deploy_launcher, deploy_launcher_bulk
from .tv_agent_ws import dispatch_clear_streaming, hub_public_url, poll_agent_command, submit_agent_result

logger = logging.getLogger("aatomhome.registry")
router = APIRouter(tags=["aatomhome"])


class RoomConfigBody(BaseModel):
    room_name: str = ""
    welcome_overrides: dict[str, Any] = Field(default_factory=dict)
    controls: list[dict[str, Any]] = Field(default_factory=list)


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
    auto_claim: bool = True


class DeployLauncherBulkBody(BaseModel):
    set_home: bool = True
    launch_welcome: bool = True
    force_reinstall: bool = True
    start_agent: bool = True
    auto_claim: bool = True
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
    merged = await store.set_room_config(device_id, body.model_dump())
    return {"device_id": device_id, "room_config": merged, "ok": True}


@router.post("/api/registry/claim-by-code")
async def claim_by_code(body: ClaimBody, request: Request) -> dict[str, Any]:
    """Flow C — TV enters claim code; hub binds fingerprint to the pre-created slot."""
    meta = await store.find_by_claim_code(body.claim_code)
    if not meta:
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
        raise HTTPException(400, "Invalid claim code")
    fingerprint = body.device_fingerprint or _client_host(request)
    host = _client_host(request)
    if host and host != device.get("host"):
        await db.update_device(device_id, host=host)
        device = await db.get_device(device_id)
    await store.upsert_meta(
        device_id,
        device_fingerprint=fingerprint,
        registration_status="claimed",
        pending_approval=0,
    )
    if body.hub_url:
        pass  # TV stores hub_url locally; hub echoes canonical URL
    return {
        "ok": True,
        "device_id": device_id,
        "hub_public_url": hub_public_url(),
        "room_config": await store.get_room_config(device_id),
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


class AgentResultBody(BaseModel):
    command: str
    ok: bool = True
    error: str | None = None
    cleared: list[str] = Field(default_factory=list)


@router.post("/api/tv-agent/{device_id}/poll")
async def tv_agent_poll(device_id: int, body: AgentPollBody | None = None) -> dict[str, Any]:
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    if body and body.device_fingerprint:
        await store.upsert_meta(device_id, device_fingerprint=body.device_fingerprint)
    await store.set_agent_connected(device_id, True)
    command = await poll_agent_command(device_id, timeout=20.0)
    if command is None:
        return {"ok": True, "command": None}
    return {"ok": True, **command}


@router.post("/api/tv-agent/{device_id}/result")
async def tv_agent_result(device_id: int, body: AgentResultBody) -> dict[str, Any]:
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    await submit_agent_result(
        device_id,
        {
            "type": "command_result",
            "command": body.command,
            "ok": body.ok,
            "error": body.error,
            "cleared": body.cleared,
        },
    )
    return {"ok": True}


@router.post("/api/aatomhome/registry/{device_id}/clear-streaming-logins")
async def clear_streaming_via_agent(device_id: int) -> dict[str, Any]:
    """Try TV agent WebSocket first; fall back to hub ADB."""
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    agent_result = await dispatch_clear_streaming(device_id)
    if agent_result.get("ok"):
        return {"ok": True, "via": "tv_agent", **agent_result}
    import guest_profile
    import adb

    serial = f"{device['host']}:{device['port']}"
    await adb.connect(device["host"], device["port"])
    owner_id = device.get("owner_user_id") or guest_profile.MAIN_USER_ID
    adb_result = await guest_profile.clear_streaming_logins(serial, [owner_id])
    return {"ok": True, "via": "adb", **adb_result}
