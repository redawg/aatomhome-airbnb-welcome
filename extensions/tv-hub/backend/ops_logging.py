"""Structured logging helpers for deploy, streaming sync, and clear-logins operations."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any


def operation_id(prefix: str = "op") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def log_op_start(
    logger: logging.Logger,
    op: str,
    *,
    op_id: str | None = None,
    **context: Any,
) -> tuple[str, float]:
    op_id = op_id or operation_id(op.replace("_", "-")[:12])
    ctx = " ".join(f"{k}={v!r}" for k, v in context.items() if v is not None)
    logger.info("[%s] %s START %s", op_id, op, ctx)
    return op_id, time.monotonic()


def log_op_end(
    logger: logging.Logger,
    op_id: str,
    op: str,
    ok: bool,
    started: float,
    message: str,
    **extra: Any,
) -> int:
    duration_ms = int((time.monotonic() - started) * 1000)
    level = logging.INFO if ok else logging.WARNING
    detail = " ".join(f"{k}={v}" for k, v in extra.items() if v is not None)
    logger.log(
        level,
        "[%s] %s %s %sms — %s%s",
        op_id,
        op,
        "OK" if ok else "FAIL",
        duration_ms,
        message,
        f" ({detail})" if detail else "",
    )
    return duration_ms


def step(
    action: str,
    ok: bool,
    message: str,
    *,
    skipped: bool = False,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "action": action,
        "ok": ok,
        "skipped": skipped,
        "message": message,
        **extra,
    }


def append_message(messages: list[str], line: str) -> None:
    if line:
        messages.append(line)


def summarize_package_results(
    cleared: list[dict],
    skipped: list[dict],
    errors: list[dict],
) -> str:
    parts = [f"cleared {len(cleared)}"]
    if skipped:
        parts.append(f"skipped {len(skipped)}")
    if errors:
        parts.append(f"failed {len(errors)}")
    return ", ".join(parts)


def format_package_line(entry: dict, *, prefix: str = "") -> str:
    label = entry.get("device_package") or entry.get("package") or "?"
    uid = entry.get("user_id")
    user_bit = f" user={uid}" if uid is not None else ""
    reason = entry.get("reason")
    if entry.get("ok"):
        return f"{prefix}✓ {label}{user_bit}"
    if reason:
        return f"{prefix}⊘ {label}{user_bit} ({reason})"
    msg = (entry.get("message") or "failed").strip().replace("\n", " ")
    if len(msg) > 120:
        msg = msg[:117] + "..."
    return f"{prefix}✗ {label}{user_bit}: {msg}"
