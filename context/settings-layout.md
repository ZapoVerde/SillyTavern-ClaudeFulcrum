# ST Settings Layout

All paths relative to ST app root (`/home/node/app`).

## Read-Only Zones
`public/scripts/extensions/third-party/`, `plugins/`, `src/` — never write to these.
Only `data/default-user/` is writable.

## Main Settings File

`data/default-user/settings.json`

Top-level keys of interest:

| Key | Purpose |
|-----|---------|
| `main_api` | Active API: `"openai"`, `"textgenerationwebui"`, `"claude"`, etc. |
| `active_character` | Currently selected character filename |
| `active_group` | Currently selected group ID |
| `max_context` | Maximum context size (tokens) |
| `amount_gen` | Max new tokens to generate |
| `world_info_settings` | Lorebook scan depth, budget, activation settings |
| `extension_settings` | Per-extension settings objects (keyed by extension ID) |
| `power_user` | Advanced user preferences |
| `oai_settings` | OpenAI API settings (model, temp, etc.) |
| `textgenerationwebui_settings` | TextGen WebUI settings |

## Preset / Template Directories

| What | Path |
|------|------|
| Text generation presets | `data/default-user/TextGen Settings/` |
| OpenAI presets | `data/default-user/OpenAI Settings/` |
| KoboldAI presets | `data/default-user/KoboldAI Settings/` |
| Instruct templates | `data/default-user/instruct/` |
| System prompt presets | `data/default-user/sysprompt/` |
| Context templates | `data/default-user/context/` |
| Quick reply presets | `data/default-user/QuickReplies/` |
| Themes | `data/default-user/themes/` |
| Reasoning presets | `data/default-user/reasoning/` |

## Extension Settings

Extension settings live inside `settings.json` under `extension_settings.<extension_id>`. They are saved by ST when the user changes them in the UI. To read an extension's current settings, read `settings.json` and navigate to the relevant key.

## User Data

| What | Path |
|------|------|
| Character cards | `data/default-user/characters/` |
| Chat history | `data/default-user/chats/<character-name>/` |
| Lorebooks | `data/default-user/worlds/` |
| Character images | `data/default-user/user/images/` |
| Groups | `data/default-user/groups/` |
| Group chats | `data/default-user/group chats/` |
| Secrets (API keys) | `data/default-user/secrets.json` — **read-only, never modify** |
