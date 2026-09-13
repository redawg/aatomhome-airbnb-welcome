"""SQLite metadata for room config, claim codes, and pending registrations."""

from __future__ import annotations

import json
import os
import secrets
import string
from datetime import datetime, timezone
from typing import Any

import aiosqlite

DB_PATH = os.environ.get("ADB_TV_DB", "/data/devices.db")

_DEFAULT_ROOM = {
    "room_name": "",
    "welcome_overrides": {},
    "controls": [],
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_claim_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def init_extension_tables() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS aatomhome_device_meta (
                device_id INTEGER PRIMARY KEY,
                room_config TEXT NOT NULL DEFAULT '{}',
                claim_code TEXT,
                registration_status TEXT NOT NULL DEFAULT 'active',
                device_fingerprint TEXT,
                pending_approval INTEGER NOT NULL DEFAULT 0,
                agent_connected INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS aatomhome_pending_devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 5555,
                device_fingerprint TEXT,
                product_model TEXT,
                pairing_code TEXT,
                claim_code TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        await db.commit()


async def get_meta(device_id: int) -> dict[str, Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM aatomhome_device_meta WHERE device_id = ?",
            (device_id,),
        ) as cur:
            row = await cur.fetchone()
            if not row:
                return {}
            data = dict(row)
            try:
                data["room_config"] = json.loads(data.get("room_config") or "{}")
            except json.JSONDecodeError:
                data["room_config"] = dict(_DEFAULT_ROOM)
            return data


async def upsert_meta(device_id: int, **fields) -> dict[str, Any]:
    allowed = {
        "room_config",
        "claim_code",
        "registration_status",
        "device_fingerprint",
        "pending_approval",
        "agent_connected",
    }
    existing = await get_meta(device_id)
    now = _now()
    room_config = fields.get("room_config", existing.get("room_config", _DEFAULT_ROOM))
    if isinstance(room_config, dict):
        room_config = json.dumps(room_config)
    claim_code = fields.get("claim_code", existing.get("claim_code"))
    if claim_code is None and not existing:
        claim_code = _gen_claim_code()
    reg_status = fields.get("registration_status", existing.get("registration_status", "active"))
    fingerprint = fields.get("device_fingerprint", existing.get("device_fingerprint"))
    pending = int(fields.get("pending_approval", existing.get("pending_approval", 0)))
    agent = int(fields.get("agent_connected", existing.get("agent_connected", 0)))

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO aatomhome_device_meta (
                device_id, room_config, claim_code, registration_status,
                device_fingerprint, pending_approval, agent_connected, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                room_config = excluded.room_config,
                claim_code = excluded.claim_code,
                registration_status = excluded.registration_status,
                device_fingerprint = excluded.device_fingerprint,
                pending_approval = excluded.pending_approval,
                agent_connected = excluded.agent_connected,
                updated_at = excluded.updated_at
            """,
            (
                device_id,
                room_config,
                claim_code,
                reg_status,
                fingerprint,
                pending,
                agent,
                now,
            ),
        )
        await db.commit()
    return await get_meta(device_id)


async def get_room_config(device_id: int) -> dict[str, Any]:
    meta = await get_meta(device_id)
    cfg = meta.get("room_config") or {}
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except json.JSONDecodeError:
            cfg = {}
    return {**_DEFAULT_ROOM, **cfg}


async def set_room_config(device_id: int, config: dict[str, Any]) -> dict[str, Any]:
    merged = {**_DEFAULT_ROOM, **(config or {})}
    await upsert_meta(device_id, room_config=merged)
    return merged


async def ensure_meta_for_device(device_id: int) -> dict[str, Any]:
    meta = await get_meta(device_id)
    if meta:
        return meta
    return await upsert_meta(device_id)


async def find_by_claim_code(claim_code: str) -> dict[str, Any] | None:
    code = (claim_code or "").strip().upper()
    if not code:
        return None
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM aatomhome_device_meta WHERE UPPER(claim_code) = ?",
            (code,),
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def create_pending_device(
    *,
    host: str,
    name: str | None = None,
    port: int = 5555,
    device_fingerprint: str | None = None,
    product_model: str | None = None,
    pairing_code: str | None = None,
    property_id: int = 1,
) -> dict[str, Any]:
    now = _now()
    claim = _gen_claim_code()
    display = name or f"TV {host}"
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            INSERT INTO aatomhome_pending_devices (
                property_id, name, host, port, device_fingerprint, product_model,
                pairing_code, claim_code, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            """,
            (
                property_id,
                display,
                host,
                port,
                device_fingerprint,
                product_model,
                pairing_code,
                claim,
                now,
                now,
            ),
        )
        await db.commit()
        pid = cur.lastrowid
        async with db.execute(
            "SELECT * FROM aatomhome_pending_devices WHERE id = ?", (pid,)
        ) as c2:
            row = await c2.fetchone()
            return dict(row) if row else {}


async def list_pending_devices() -> list[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM aatomhome_pending_devices WHERE status = 'pending' ORDER BY id"
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def get_pending_device(pending_id: int) -> dict[str, Any] | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM aatomhome_pending_devices WHERE id = ?", (pending_id,)
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def approve_pending_device(pending_id: int, db_mod) -> dict[str, Any]:
    pending = await get_pending_device(pending_id)
    if not pending or pending.get("status") != "pending":
        raise ValueError("pending_not_found")
    device_id = await db_mod.create_device(
        name=pending["name"],
        host=pending["host"],
        port=pending.get("port") or 5555,
    )
    await upsert_meta(
        device_id,
        device_fingerprint=pending.get("device_fingerprint"),
        registration_status="active",
        claim_code=pending.get("claim_code"),
    )
    now = _now()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            "UPDATE aatomhome_pending_devices SET status = 'approved', updated_at = ? WHERE id = ?",
            (now, pending_id),
        )
        await conn.commit()
    device = await db_mod.get_device(device_id)
    return {"device": device, "pending_id": pending_id, "device_id": device_id}


async def set_agent_connected(device_id: int, connected: bool) -> None:
    await upsert_meta(device_id, agent_connected=int(connected))
