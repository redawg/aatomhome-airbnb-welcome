"""Optional plugin hooks for aatomhome_airbnb_welcome.

Third-party or property-specific code can register callbacks without forking
the core integration. See docs/HA-PLUGIN-FRAMEWORK.md.
"""

from __future__ import annotations

from typing import Any, Callable, Awaitable

# hub_url -> async callback(coordinator, hub_data) -> None
_ON_SYNC_HOOKS: list[Callable[..., Awaitable[None]]] = []


def register_on_sync(hook: Callable[..., Awaitable[None]]) -> None:
    """Register an async hook run after each successful hub poll."""
    _ON_SYNC_HOOKS.append(hook)


async def run_sync_hooks(coordinator: Any, data: dict[str, Any]) -> None:
    """Invoke registered plugins after coordinator refresh."""
    for hook in _ON_SYNC_HOOKS:
        await hook(coordinator, data)
