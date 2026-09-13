"""Guest Google TV account helpers via ADB — per-property account from hub config."""

import logging
import re

from adb import (
    STREAMING_COMPANION_PACKAGES,
    clear_package,
    force_stop,
    list_installed_streaming_apps,
    list_users,
    resolve_installed_package,
    shell,
    streaming_clear_packages,
)
from guest_account_resolve import (
    DEFAULT_GUEST_GOOGLE_ACCOUNT,
    resolve_guest_google_account,
)
from ops_logging import (
    append_message,
    format_package_line,
    log_op_end,
    log_op_start,
    operation_id,
    summarize_package_results,
)

logger = logging.getLogger("adb-tv-hub.streaming")

# Legacy import name — default only; use resolve_guest_google_account() for property-aware checks.
GUEST_GOOGLE_ACCOUNT = DEFAULT_GUEST_GOOGLE_ACCOUNT
MAIN_USER_ID = 0


async def list_users_detailed(serial: str) -> list[dict]:
    """List Android users with types from dumpsys user."""
    basic = {u["id"]: u for u in await list_users(serial)}
    result = await shell(serial, "dumpsys user")
    users: list[dict] = []

    current_id: int | None = None
    for line in result.stdout.splitlines():
        m = re.search(r"UserInfo\{(\d+):([^:}]*):(\w+)\}", line)
        if m:
            uid, name, flags = m.groups()
            current_id = int(uid)
            entry = basic.get(current_id, {"id": current_id, "name": name, "flags": flags, "running": False})
            entry = {**entry, "id": current_id, "name": name or entry.get("name", ""), "flags": flags}
            entry.setdefault("type", "")
            entry.setdefault("parent_id", None)
            users.append(entry)
            continue
        if current_id is not None:
            tm = re.search(r"^\s+Type:\s+(\S+)", line)
            if tm:
                for u in users:
                    if u["id"] == current_id:
                        u["type"] = tm.group(1)
            pm = re.search(r"parentId=(\d+)", line)
            if pm:
                for u in users:
                    if u["id"] == current_id:
                        u["parent_id"] = int(pm.group(1))

    return users


async def _google_accounts_by_user(serial: str) -> dict[int, list[str]]:
    result = await shell(serial, "dumpsys account")
    by_user: dict[int, list[str]] = {}
    current_user: int | None = None
    for line in (result.stdout or "").splitlines():
        um = re.search(r"User UserInfo\{(\d+):", line)
        if um:
            current_user = int(um.group(1))
            by_user.setdefault(current_user, [])
            continue
        am = re.search(r"Account \{name=([^,]+), type=com\.google\}", line)
        if am and current_user is not None:
            by_user.setdefault(current_user, []).append(am.group(1))
    return by_user


async def detect_profile_lock(serial: str) -> dict:
    """Best-effort read of Google TV profile lock from LauncherX logs."""
    result = await shell(serial, "dumpsys activity service com.google.android.apps.tv.launcherx")
    text = result.stdout or ""
    lines = [ln for ln in text.splitlines() if "Profile lock condition" in ln]
    recent = lines[-2:] if lines else []
    locked = any("[true]" in ln for ln in recent)
    return {
        "detected": bool(recent),
        "likely_locked": locked,
        "recent_lines": recent[-2:],
        "note": "Profile lock PIN is set on the TV under Accounts & Sign In.",
    }


def _has_guest_account(accts: list[str], guest_email: str) -> bool:
    target = (guest_email or "").strip().lower()
    if not target:
        return False
    return any(target in (a or "").lower() for a in accts)


async def has_guest_account_on_main(
    serial: str,
    guest_email: str | None = None,
) -> bool:
    """True when the property's guest Google account is on the main TV profile."""
    expected = guest_email or await resolve_guest_google_account(serial=serial)
    accounts = await _google_accounts_by_user(serial)
    return _has_guest_account(accounts.get(MAIN_USER_ID, []), expected)


async def find_guest_account_user_id(serial: str) -> int | None:
    """Return MAIN_USER_ID when the guest account is on the main profile."""
    if await has_guest_account_on_main(serial):
        return MAIN_USER_ID
    return None


async def get_guest_status(serial: str) -> dict:
    """Summarize main TV profile, guest account, and hub capabilities."""
    guest_email = await resolve_guest_google_account(serial=serial)
    users = await list_users_detailed(serial)
    accounts = await _google_accounts_by_user(serial)
    current = await shell(serial, "am get-current-user")
    try:
        current_user = int((current.stdout or "0").strip())
    except ValueError:
        current_user = MAIN_USER_ID

    main_accounts = accounts.get(MAIN_USER_ID, [])
    guest_configured = _has_guest_account(main_accounts, guest_email)
    main_streaming = await list_installed_streaming_apps(serial, user_id=MAIN_USER_ID)

    profiles = []
    for user in users:
        uid = user["id"]
        profiles.append({
            "id": uid,
            "name": user.get("name"),
            "type": user.get("type"),
            "is_main": uid == MAIN_USER_ID,
            "google_accounts": accounts.get(uid, []),
            "is_current": uid == current_user,
        })

    extra_profiles = [p for p in profiles if p["id"] != MAIN_USER_ID]
    return {
        "current_user": current_user,
        "main_user_id": MAIN_USER_ID,
        "guest_google_account": guest_email,
        "guest_account": {
            "user_id": MAIN_USER_ID,
            "accounts": main_accounts,
            "configured": guest_configured,
            "expected_email": guest_email,
        },
        "guest_profile": {
            "user_id": MAIN_USER_ID if guest_configured else None,
            "accounts": main_accounts if guest_configured else [],
            "configured": guest_configured,
        },
        "main_profile": {
            "user_id": MAIN_USER_ID,
            "accounts": main_accounts,
            "streaming_apps": main_streaming,
        },
        "profiles": profiles,
        "extra_profile_count": len(extra_profiles),
        "profile_lock": await detect_profile_lock(serial),
        "setup_workflow": [
            f"Sign in to the TV with {guest_email} as the main Google account",
            "Add the TV to Google Home and enable wireless debugging",
            "Register the TV in the hub, then run Provision New TV or Deploy to all TVs",
            "Remove any extra profiles on the TV so only the guest account remains",
        ],
        "recommendation": (
            f"Each TV should use only {guest_email} on the main profile. "
            "Clear streaming logins between stays from the hub."
        ),
    }


async def clear_streaming_logins(
    serial: str,
    user_ids: list[int] | None = None,
    extra_packages: list[str] | None = None,
) -> dict:
    """Clear streaming app credentials on the main TV profile."""
    op_id, started = log_op_start(
        logger,
        "clear_streaming_logins",
        op_id=operation_id("clear"),
        serial=serial,
        user_ids=user_ids or [MAIN_USER_ID],
    )
    messages: list[str] = []

    if not user_ids:
        user_ids = [MAIN_USER_ID]

    packages_to_clear: list[str] = []
    seen_catalog: set[str] = set()
    for pkg in streaming_clear_packages():
        if pkg not in seen_catalog:
            seen_catalog.add(pkg)
            packages_to_clear.append(pkg)
    for pkg in extra_packages or []:
        if pkg not in seen_catalog:
            seen_catalog.add(pkg)
            packages_to_clear.append(pkg)

    append_message(messages, f"Clear streaming logins on {serial} — {len(packages_to_clear)} catalog package(s)")
    cleared: list[dict] = []
    skipped: list[dict] = []
    errors: list[dict] = []

    for user_id in user_ids:
        append_message(messages, f"Profile user_id={user_id}")
        seen_device_pkgs: set[str] = set()
        for pkg in packages_to_clear:
            device_pkg = await resolve_installed_package(serial, pkg, user_id)
            if not device_pkg:
                entry = {"user_id": user_id, "package": pkg, "reason": "not installed"}
                skipped.append(entry)
                line = format_package_line(entry)
                append_message(messages, line)
                logger.debug("[%s] %s", op_id, line)
                continue
            if device_pkg in seen_device_pkgs:
                continue
            seen_device_pkgs.add(device_pkg)
            await force_stop(serial, device_pkg, user_id=user_id)
            result = await clear_package(serial, device_pkg, user_id=user_id)
            text = result.text()
            ok = result.ok and "Success" in text
            entry = {
                "user_id": user_id,
                "package": pkg,
                "device_package": device_pkg,
                "ok": ok,
                "message": text,
            }
            line = format_package_line(entry)
            append_message(messages, line)
            if ok:
                cleared.append(entry)
                logger.info("[%s] cleared %s (user %s)", op_id, device_pkg, user_id)
            else:
                errors.append(entry)
                logger.warning("[%s] clear failed %s (user %s): %s", op_id, device_pkg, user_id, text.strip())

        for pkg in STREAMING_COMPANION_PACKAGES:
            if pkg in seen_device_pkgs:
                continue
            listed = await shell(serial, f"pm list packages --user {user_id} {pkg}")
            exact = f"package:{pkg}"
            if not any(line.strip() == exact for line in (listed.stdout or "").splitlines()):
                continue
            seen_device_pkgs.add(pkg)
            await force_stop(serial, pkg, user_id=user_id)
            result = await clear_package(serial, pkg, user_id=user_id)
            text = result.text()
            ok = result.ok and "Success" in text
            entry = {"user_id": user_id, "package": pkg, "device_package": pkg, "ok": ok, "message": text}
            line = format_package_line(entry)
            append_message(messages, line)
            if ok:
                cleared.append(entry)
                logger.info("[%s] cleared companion %s (user %s)", op_id, pkg, user_id)
            else:
                errors.append(entry)
                logger.warning("[%s] companion clear failed %s: %s", op_id, pkg, text.strip())

    summary = summarize_package_results(cleared, skipped, errors)
    ok = not errors
    note = (
        f"Cleared {len(cleared)} streaming package(s). Each app will require a fresh sign-in."
        if ok
        else f"Cleared {len(cleared)} package(s); {len(errors)} failed — see messages."
    )
    append_message(messages, note)
    duration_ms = log_op_end(
        logger,
        op_id,
        "clear_streaming_logins",
        ok,
        started,
        summary,
        cleared=len(cleared),
        skipped=len(skipped),
        errors=len(errors),
    )
    return {
        "ok": ok,
        "operation_id": op_id,
        "duration_ms": duration_ms,
        "user_ids": user_ids,
        "cleared": cleared,
        "skipped": skipped,
        "errors": errors,
        "messages": messages,
        "note": note,
        "message": summary,
    }
