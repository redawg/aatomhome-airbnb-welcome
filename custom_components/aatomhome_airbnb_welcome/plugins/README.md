# Integration plugins

Drop Python modules here and import them from a `custom_components/aatomhome_airbnb_welcome_plugins/` package on your HA instance, **or** fork and add hooks in this directory.

## Built-in hook API

```python
from custom_components.aatomhome_airbnb_welcome.plugins import register_on_sync

async def my_hook(coordinator, data):
    # data: hub poll payload (registry, guest state, …)
    ...

register_on_sync(my_hook)
```

Load your plugin from `configuration.yaml` via a small loader package, or merge into a private fork.

See **docs/HA-PLUGIN-FRAMEWORK.md** for the full extension model (entities, services, automations).
