# Agent instructions

AI agents (Cursor, Claude Code, etc.) deploying this project:

1. Read **[`.cursor/skills/aatomhome-deploy/SKILL.md`](.cursor/skills/aatomhome-deploy/SKILL.md)**
2. Ask questions from **[`deploy/QUESTIONNAIRE.md`](deploy/QUESTIONNAIRE.md)** — HA URL, long-lived token, hub URL, Tempest keys, TV IPs
3. Write **`deploy/.env`** from [`deploy/env.template`](deploy/env.template)
4. Run **`./scripts/build.sh`** then **`./scripts/deploy.sh`**

Prebuilt guest launcher APK (MIT): [`guest-launcher/releases/aatomhome-guest-welcome.apk`](guest-launcher/releases/aatomhome-guest-welcome.apk)

Do not modify frozen legacy production unless the user explicitly requests it.
