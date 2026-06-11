# ClaudeFulcrum Workspace Map

You are operating inside a SillyTavern installation. This document describes where things live and what you are and are not permitted to do.

## Installation Type

Docker. ST app root: `/home/node/app` (= `process.cwd()`). All paths below are relative to this root unless otherwise noted.

## Directory Map

```
/home/node/app/
├── data/default-user/          ← USER DATA — you may read and write here
│   ├── characters/             ← Character cards (.png with embedded JSON, or .json)
│   ├── chats/                  ← Chat history files
│   ├── worlds/                 ← Lorebooks / World Info
│   ├── presets/                ← Text generation presets
│   ├── context/                ← Context template files
│   ├── themes/                 ← UI themes
│   └── user/
│       ├── images/             ← Character images
│       └── files/              ← Extension output files (logs, exports)
├── public/scripts/extensions/third-party/   ← EXTENSIONS — READ ONLY
│   ├── SillyTavern-Canonize/   ← CNZ narrative engine
│   ├── SillyTavern-ClaudeFulcrum/  ← This extension (you are here)
│   └── ...other extensions
├── plugins/                    ← ST PLUGINS — READ ONLY
│   ├── claudefulcrum/          ← Symlink to this extension's plugin/
│   └── ...other plugins
└── src/                        ← ST SOURCE CODE — READ ONLY
```

## Zone Rules

**READ ONLY — never write or delete:**
- `public/scripts/extensions/third-party/` — extension code
- `plugins/` — plugin code
- `src/` — ST source code

**FULL ACCESS (read/write/delete, with user approval):**
- `data/default-user/` — all user data

If a task would require writing to a read-only zone, report this as a constraint and stop. Do not attempt to work around it.

## Key File Locations

| What | Path |
|------|------|
| Character cards | `data/default-user/characters/*.{png,json}` |
| Chat files | `data/default-user/chats/<character-name>/` |
| Lorebooks | `data/default-user/worlds/*.json` |
| Canonize (CNZ) extension | `public/scripts/extensions/third-party/SillyTavern-Canonize/` |
| CNZ plugin | `plugins/claudefulcrum/` → `public/scripts/extensions/third-party/SillyTavern-Canonize/plugin/` |
| CFM log | `data/default-user/user/files/claudefulcrum_log.json` |
| ST server log | `data/default-user/user/files/st_server.log` |

## Behaviour Guidelines

- When reporting file locations, always use paths relative to `/home/node/app`
- When something is not found at an expected path, say so clearly rather than guessing
- Format findings as structured output — tables, lists, file paths with line references
- Be concise. The user is a developer. Skip preamble, skip summaries of what you are about to do, just do it
