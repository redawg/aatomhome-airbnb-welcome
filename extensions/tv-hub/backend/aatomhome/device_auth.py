"""TV device session tokens — issued on room-code claim, required for guest APIs."""

from __future__ import annotations

import hashlib
import os
import secrets
from typing import Any

from fastapi import Header, HTTPException, Request

from . import store

SESSION_BYTES = 32


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session_token() -> tuple[str, str]:
    """Return (plaintext token for TV, hash for DB)."""
    token = secrets.token_urlsafe(SESSION_BYTES)
    return token, _hash_token(token)


def require_tls(request: Request) -> None:
    """When HUB_REQUIRE_TLS=1, reject cleartext TV API calls."""
    if os.environ.get("HUB_REQUIRE_TLS", "").strip().lower() not in ("1", "true", "yes"):
        return
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "").lower()
    if proto != "https":
        raise HTTPException(403, "HTTPS required for TV API calls")


async def resolve_tv_device(
    request: Request,
    authorization: str | None = Header(default=None),
    x_device_fingerprint: str | None = Header(default=None, alias="X-Device-Fingerprint"),
) -> dict[str, Any]:
    """
    Validate TV session + fingerprint. Returns device row, meta, device_id.
    """
    require_tls(request)
    fp = (x_device_fingerprint or "").strip()
    if not fp:
        raise HTTPException(401, "X-Device-Fingerprint required")

    meta = await store.find_by_fingerprint(fp)
    if not meta:
        raise HTTPException(401, "TV not registered — enter your room code")

    auth = (authorization or "").strip()
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Device session required")
    token = auth[7:].strip()
    if not token:
        raise HTTPException(401, "Device session required")

    expected = (meta.get("device_session_hash") or "").strip()
    if not expected or _hash_token(token) != expected:
        raise HTTPException(401, "Invalid or expired device session")

    status = meta.get("registration_status") or ""
    if status not in ("claimed", "active"):
        raise HTTPException(403, "TV not claimed — enter your room code")

    import database as db

    device_id = int(meta["device_id"])
    device = await db.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")

    return {
        "device_id": device_id,
        "device": device,
        "meta": meta,
        "fingerprint": fp,
    }
