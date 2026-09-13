"""Outbound TV agent WebSocket + HTTP poll fallback."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import store

logger = logging.getLogger("aatomhome.tv_agent")
router = APIRouter(tags=["aatomhome-tv-agent"])

_lock = asyncio.Lock()


@dataclass
class AgentSession:
    websocket: WebSocket
    responses: asyncio.Queue[dict[str, Any]] = field(default_factory=asyncio.Queue)


_sessions: dict[int, AgentSession] = {}
_command_queues: dict[int, asyncio.Queue[dict[str, Any]]] = {}
_result_queues: dict[int, asyncio.Queue[dict[str, Any]]] = {}


def hub_public_url() -> str:
    return os.environ.get("HUB_PUBLIC_URL", "http://127.0.0.1:8080").rstrip("/")


async def _command_queue(device_id: int) -> asyncio.Queue[dict[str, Any]]:
    async with _lock:
        if device_id not in _command_queues:
            _command_queues[device_id] = asyncio.Queue()
        return _command_queues[device_id]


async def _result_queue(device_id: int) -> asyncio.Queue[dict[str, Any]]:
    async with _lock:
        if device_id not in _result_queues:
            _result_queues[device_id] = asyncio.Queue()
        return _result_queues[device_id]


async def _register(device_id: int, session: AgentSession) -> None:
    async with _lock:
        old = _sessions.get(device_id)
        if old is not None and old.websocket is not session.websocket:
            try:
                await old.websocket.close()
            except Exception:
                pass
        _sessions[device_id] = session
    await store.set_agent_connected(device_id, True)


async def _unregister(device_id: int) -> None:
    async with _lock:
        _sessions.pop(device_id, None)
    await store.set_agent_connected(device_id, False)


async def send_command(
    device_id: int,
    command: str,
    payload: dict[str, Any] | None = None,
    timeout: float = 45.0,
) -> dict[str, Any]:
    message = {"type": "command", "command": command, "payload": payload or {}}
    async with _lock:
        session = _sessions.get(device_id)
    if session is not None:
        await session.websocket.send_text(json.dumps(message))
        try:
            return await asyncio.wait_for(session.responses.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"ok": False, "error": "agent_timeout"}

    cmd_q = await _command_queue(device_id)
    res_q = await _result_queue(device_id)
    await cmd_q.put(message)
    try:
        return await asyncio.wait_for(res_q.get(), timeout=timeout)
    except asyncio.TimeoutError:
        return {"ok": False, "error": "agent_timeout"}


async def dispatch_clear_streaming(device_id: int) -> dict[str, Any]:
    return await send_command(device_id, "clear_streaming_logins")


async def poll_agent_command(device_id: int, timeout: float = 20.0) -> dict[str, Any] | None:
    cmd_q = await _command_queue(device_id)
    try:
        return await asyncio.wait_for(cmd_q.get(), timeout=timeout)
    except asyncio.TimeoutError:
        return None


async def submit_agent_result(device_id: int, result: dict[str, Any]) -> None:
    async with _lock:
        session = _sessions.get(device_id)
    if session is not None:
        await session.responses.put(result)
        return
    res_q = await _result_queue(device_id)
    await res_q.put(result)


@router.websocket("/api/tv-agent/ws")
async def tv_agent_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    device_id: int | None = None
    session = AgentSession(websocket=websocket)
    try:
        hello_raw = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
        hello = json.loads(hello_raw)
        if hello.get("type") != "register":
            await websocket.send_text(json.dumps({"ok": False, "error": "expected_register"}))
            await websocket.close()
            return
        device_id = int(hello["device_id"])
        device_fingerprint = hello.get("device_fingerprint")
        await store.upsert_meta(device_id, device_fingerprint=device_fingerprint)
        await _register(device_id, session)
        await websocket.send_text(
            json.dumps(
                {
                    "ok": True,
                    "type": "registered",
                    "device_id": device_id,
                    "hub_public_url": hub_public_url(),
                }
            )
        )
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "command_result":
                await session.responses.put(msg)
            elif msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("TV agent WS error: %s", exc)
    finally:
        if device_id is not None:
            await _unregister(device_id)
