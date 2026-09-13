#!/usr/bin/env python3
"""Inject structured ops logging into upstream tv-hub main + streaming_apps."""

from __future__ import annotations

import sys
from pathlib import Path


def patch_main(path: Path) -> bool:
    text = path.read_text()
    changed = False

    if "from ops_logging import" not in text:
        anchor = "logger = logging.getLogger"
        if anchor not in text:
            raise SystemExit(f"logger anchor not found in {path}")
        text = text.replace(
            anchor,
            "from ops_logging import append_message, log_op_end, log_op_start, operation_id\n\n"
            + anchor,
            1,
        )
        changed = True

    old_clear = '''async def _clear_streaming_logins_for_property(
    property_id: int = 1,
    user_ids: list[int] | None = None,
) -> dict:
    devices = await db.list_devices()
    results = []
    for device_row in devices:
        if device_row.get("property_id") not in (None, property_id):
            continue
        try:
            device, serial = await _registry_device_serial(device_row["id"])
        except HTTPException:
            results.append({
                "ok": False,
                "device_id": device_row["id"],
                "device_name": device_row.get("name"),
                "skipped": True,
                "reason": "offline",
                "message": f"{device_row.get('name')}: not connected",
            })
            continue
        result = await guest_profile.clear_streaming_logins(serial, user_ids)
        results.append({
            **result,
            "device_id": device_row["id"],
            "device_name": device_row.get("name"),
        })
    cleared = [r for r in results if r.get("ok")]
    skipped = [r for r in results if r.get("skipped")]
    return {
        "ok": bool(cleared),
        "cleared_devices": len(cleared),
        "skipped": len(skipped),
        "results": results,
        "message": f"Cleared streaming logins on {len(cleared)} TV(s), {len(skipped)} skipped",
    }'''

    new_clear = '''async def _clear_streaming_logins_for_property(
    property_id: int = 1,
    user_ids: list[int] | None = None,
) -> dict:
    op_id, started = log_op_start(
        logger,
        "clear_streaming_property",
        op_id=operation_id("clear-all"),
        property_id=property_id,
    )
    messages: list[str] = [f"Clear streaming logins — property {property_id}"]
    devices = await db.list_devices()
    results = []
    for device_row in devices:
        if device_row.get("property_id") not in (None, property_id):
            continue
        name = device_row.get("name") or f"TV {device_row['id']}"
        try:
            device, serial = await _registry_device_serial(device_row["id"])
        except HTTPException:
            line = f"{name}: offline — skipped"
            append_message(messages, line)
            logger.warning("[%s] %s", op_id, line)
            results.append({
                "ok": False,
                "device_id": device_row["id"],
                "device_name": name,
                "skipped": True,
                "reason": "offline",
                "message": f"{name}: not connected",
                "messages": [line],
            })
            continue
        append_message(messages, f"{name} ({serial})")
        result = await guest_profile.clear_streaming_logins(serial, user_ids)
        result_messages = result.get("messages") or []
        append_message(messages, result.get("message") or f"{name}: done")
        messages.extend(result_messages)
        results.append({
            **result,
            "device_id": device_row["id"],
            "device_name": name,
        })
    cleared = [r for r in results if r.get("ok")]
    skipped = [r for r in results if r.get("skipped")]
    failed = [r for r in results if not r.get("ok") and not r.get("skipped")]
    summary = (
        f"Cleared streaming logins on {len(cleared)} TV(s)"
        + (f", {len(skipped)} offline" if skipped else "")
        + (f", {len(failed)} failed" if failed else "")
    )
    ok = bool(cleared) and not failed
    duration_ms = log_op_end(
        logger,
        op_id,
        "clear_streaming_property",
        ok,
        started,
        summary,
        cleared=len(cleared),
        skipped=len(skipped),
        failed=len(failed),
    )
    return {
        "ok": ok,
        "operation_id": op_id,
        "duration_ms": duration_ms,
        "cleared_devices": len(cleared),
        "skipped": len(skipped),
        "failed": len(failed),
        "results": results,
        "messages": messages,
        "message": summary,
    }'''

    if old_clear in text:
        text = text.replace(old_clear, new_clear, 1)
        changed = True
    elif "clear_streaming_property" not in text:
        print(f"WARN: _clear_streaming_logins_for_property block not found in {path}", file=sys.stderr)

    old_summary = '''def _summarize_guest_deploy_results(results: list[dict]) -> dict:
    synced = [r for r in results if r.get("ok")]
    skipped = [r for r in results if r.get("skipped")]
    failed = [r for r in results if not r.get("ok") and not r.get("skipped")]
    parts = [f"{len(synced)} updated"]
    if skipped:
        parts.append(f"{len(skipped)} offline")
    if failed:
        parts.append(f"{len(failed)} failed")
    return {
        "ok": bool(synced),
        "synced": len(synced),
        "skipped": len(skipped),
        "failed": len(failed),
        "results": results,
        "message": f"Guest welcome: {', '.join(parts)}",
    }'''

    new_summary = '''def _summarize_guest_deploy_results(results: list[dict]) -> dict:
    synced = [r for r in results if r.get("ok")]
    skipped = [r for r in results if r.get("skipped")]
    failed = [r for r in results if not r.get("ok") and not r.get("skipped")]
    parts = [f"{len(synced)} updated"]
    if skipped:
        parts.append(f"{len(skipped)} offline")
    if failed:
        parts.append(f"{len(failed)} failed")
    messages: list[str] = [f"Guest deploy summary: {', '.join(parts)}"]
    for row in results:
        name = row.get("device_name") or row.get("name") or "TV"
        line = row.get("message") or ("ok" if row.get("ok") else "failed")
        prefix = "⊘" if row.get("skipped") else ("✓" if row.get("ok") else "✗")
        messages.append(f"{prefix} {name}: {line}")
        for sub in row.get("messages") or []:
            messages.append(f"  {sub}")
    logger.info(
        "deploy-guest-experience synced=%s skipped=%s failed=%s",
        len(synced),
        len(skipped),
        len(failed),
    )
    return {
        "ok": bool(synced) and not failed,
        "synced": len(synced),
        "skipped": len(skipped),
        "failed": len(failed),
        "results": results,
        "messages": messages,
        "message": f"Guest welcome: {', '.join(parts)}",
    }'''

    if old_summary in text:
        text = text.replace(old_summary, new_summary, 1)
        changed = True
    elif "Guest deploy summary" not in text:
        print(f"WARN: _summarize_guest_deploy_results block not found in {path}", file=sys.stderr)

    if changed:
        path.write_text(text)
    return changed


def patch_streaming(path: Path) -> bool:
    text = path.read_text()
    changed = False

    if "from ops_logging import" not in text:
        needle = "logger = logging.getLogger(\"adb-tv-hub\")"
        if needle not in text:
            raise SystemExit(f"streaming_apps logger anchor not found in {path}")
        text = text.replace(
            needle,
            needle + "\n\nfrom ops_logging import log_op_end, log_op_start, operation_id",
            1,
        )
        changed = True

    injections = [
        (
            "async def install_packages(\n    serial: str,\n    packages: list[str],\n    owner_user_id: int = 0,\n    *,\n    source_serial: str | None = None,\n) -> dict:\n    \"\"\"Install/enable a list of streaming packages without changing the hub allow-list.\"\"\"\n    results = []",
            "async def install_packages(\n    serial: str,\n    packages: list[str],\n    owner_user_id: int = 0,\n    *,\n    source_serial: str | None = None,\n) -> dict:\n    \"\"\"Install/enable a list of streaming packages without changing the hub allow-list.\"\"\"\n    op_id, started = log_op_start(\n        logger,\n        \"install_packages\",\n        op_id=operation_id(\"install\"),\n        serial=serial,\n        count=len(packages),\n    )\n    results = []",
        ),
        (
            "    payload = {\n        \"ok\": not failed,\n        \"installed\": len(installed),\n        \"total\": len(packages),\n        \"results\": results,\n        \"failed_packages\": [r.get(\"package\") for r in failed],\n        \"message\": f\"Installed {len(installed)} of {len(packages)} app(s)\",\n    }\n    return _attach_install_report(payload, [{\"device_name\": serial, \"results\": results}])",
            "    payload = {\n        \"ok\": not failed,\n        \"installed\": len(installed),\n        \"total\": len(packages),\n        \"results\": results,\n        \"failed_packages\": [r.get(\"package\") for r in failed],\n        \"message\": f\"Installed {len(installed)} of {len(packages)} app(s)\",\n    }\n    log_op_end(\n        logger,\n        op_id,\n        \"install_packages\",\n        not failed,\n        started,\n        payload[\"message\"],\n        failed=len(failed),\n    )\n    return _attach_install_report(payload, [{\"device_name\": serial, \"results\": results}])",
        ),
        (
            "async def sync_hub_enabled(\n    serial: str,\n    enabled_packages: list[str],\n    owner_user_id: int = 0,\n    property_config: dict | None = None,\n    *,\n    source_serial: str | None = None,\n) -> dict:\n    \"\"\"Apply the full hub-enabled package list to the main TV profile.\"\"\"\n    enabled_set = set(enabled_packages)",
            "async def sync_hub_enabled(\n    serial: str,\n    enabled_packages: list[str],\n    owner_user_id: int = 0,\n    property_config: dict | None = None,\n    *,\n    source_serial: str | None = None,\n) -> dict:\n    \"\"\"Apply the full hub-enabled package list to the main TV profile.\"\"\"\n    op_id, started = log_op_start(\n        logger,\n        \"sync_hub_enabled\",\n        op_id=operation_id(\"sync\"),\n        serial=serial,\n        enabled=len(enabled_packages),\n    )\n    enabled_set = set(enabled_packages)",
        ),
        (
            "    payload = {\n        \"ok\": ok,\n        \"results\": results,\n        \"enabled_packages\": enabled_packages,\n        \"failed_packages\": [r[\"package\"] for r in failed],\n        \"enabled_count\": len(enabled_results),\n        \"disabled_count\": len(disabled_results),\n    }\n    return _attach_install_report(payload, [{\"device_name\": serial, \"results\": enabled_results}])",
            "    payload = {\n        \"ok\": ok,\n        \"results\": results,\n        \"enabled_packages\": enabled_packages,\n        \"failed_packages\": [r[\"package\"] for r in failed],\n        \"enabled_count\": len(enabled_results),\n        \"disabled_count\": len(disabled_results),\n        \"message\": f\"Synced {len(enabled_results)} enabled / {len(disabled_results)} disabled on {serial}\",\n    }\n    log_op_end(\n        logger,\n        op_id,\n        \"sync_hub_enabled\",\n        ok,\n        started,\n        payload[\"message\"],\n        failed=len(failed),\n    )\n    return _attach_install_report(payload, [{\"device_name\": serial, \"results\": enabled_results}])",
        ),
        (
            "async def install_on_device(\n    device: dict,\n    packages: list[str],\n    property_config: dict | None = None,\n    *,\n    source_serial: str | None = None,\n) -> dict:\n    \"\"\"Install selected packages on one TV; returns per-package results.\"\"\"\n    device_id = device[\"id\"]",
            "async def install_on_device(\n    device: dict,\n    packages: list[str],\n    property_config: dict | None = None,\n    *,\n    source_serial: str | None = None,\n) -> dict:\n    \"\"\"Install selected packages on one TV; returns per-package results.\"\"\"\n    device_id = device[\"id\"]\n    logger.info(\n        \"install_on_device id=%s name=%s packages=%s\",\n        device_id,\n        device.get(\"name\"),\n        len(packages),\n    )",
        ),
        (
            "async def mirror_to_device(\n    source_packages: list[str],\n    serial: str,\n    device: dict,\n    property_config: dict | None = None,\n    *,\n    source_serial: str | None = None,\n) -> dict:\n    \"\"\"Apply the source TV's streaming app list to another TV.\"\"\"\n    device_id = device[\"id\"]",
            "async def mirror_to_device(\n    source_packages: list[str],\n    serial: str,\n    device: dict,\n    property_config: dict | None = None,\n    *,\n    source_serial: str | None = None,\n) -> dict:\n    \"\"\"Apply the source TV's streaming app list to another TV.\"\"\"\n    device_id = device[\"id\"]\n    logger.info(\n        \"mirror_to_device id=%s name=%s packages=%s\",\n        device_id,\n        device.get(\"name\"),\n        len(source_packages),\n    )",
        ),
    ]

    for old, new in injections:
        if old in text and new not in text:
            text = text.replace(old, new, 1)
            changed = True

    if changed:
        path.write_text(text)
    return changed


def main() -> None:
    dest = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    main_py = dest / "backend" / "main.py"
    streaming_py = dest / "backend" / "streaming_apps.py"
    ops_py = dest / "backend" / "ops_logging.py"
    if not ops_py.is_file():
        raise SystemExit(f"missing ops_logging.py in {dest / 'backend'}")

    main_changed = patch_main(main_py) if main_py.is_file() else False
    stream_changed = patch_streaming(streaming_py) if streaming_py.is_file() else False
    if main_changed:
        print("==> Patched main.py ops logging")
    if stream_changed:
        print("==> Patched streaming_apps.py ops logging")
    if not main_changed and not stream_changed:
        print("==> Ops logging patches already applied (or blocks not found)")


if __name__ == "__main__":
    main()
