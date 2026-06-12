# Lorebook (World Info) Format

## Location
`data/default-user/worlds/` relative to ST app root (`/home/node/app`).

Files are `.json`. Naming is free-form — name them after the character or world they belong to.

## JSON Structure

```json
{
  "name": "LorebookName",
  "entries": {
    "0": { ...entry },
    "1": { ...entry }
  },
  "extensions": {}
}
```

`entries` is an object keyed by `uid` as a string. UIDs must be unique integers (as strings). When adding entries, use the next available integer.

## Entry Structure

```json
{
  "uid": 0,
  "comment": "Entry display name (shown in ST UI)",
  "key": ["trigger word", "alternate trigger"],
  "keysecondary": [],
  "content": "Text injected into context when this entry activates.",
  "constant": false,
  "selective": false,
  "selectiveLogic": 0,
  "addMemo": true,
  "order": 100,
  "position": 0,
  "disable": false,
  "probability": 100,
  "useProbability": false,
  "depth": 4,
  "sticky": 0,
  "cooldown": 0,
  "delay": 0,
  "group": "",
  "groupWeight": 100,
  "scanDepth": null,
  "caseSensitive": null,
  "matchWholeWords": null,
  "vectorized": false,
  "excludeRecursion": false,
  "preventRecursion": false,
  "delayUntilRecursion": false,
  "displayIndex": 0,
  "characterFilter": null
}
```

## Key Fields

| Field | Purpose |
|-------|---------|
| `comment` | Label shown in ST's lorebook editor. Use a descriptive name. |
| `key` | Array of strings — any match triggers this entry |
| `keysecondary` | Secondary keys — used when `selective: true` |
| `content` | The text injected into context. Can be multi-paragraph. |
| `constant` | `true` = always inject, ignoring keys |
| `selective` | `true` = requires both a primary AND secondary key match |
| `selectiveLogic` | `0` = AND (all secondary must match), `1` = OR (any secondary matches) |
| `order` | Injection priority — lower numbers inject first |
| `position` | Where in context: `0` = before char def, `1` = after char def, `4` = at depth (chat messages from bottom) |
| `depth` | Used when `position: 4` — how many messages from the bottom to inject at |
| `disable` | `true` = entry exists but is inactive |
| `probability` | 0–100 chance of activating (requires `useProbability: true`) |
| `sticky` | Turns to stay active after initial trigger |
| `cooldown` | Turns to wait before can re-trigger |
| `group` | Group name — entries in the same group compete; only highest-scored activates |

## Adding Entries

When adding entries to an existing lorebook:
1. Read the file to find the current highest `uid`
2. Add new entries with uid = highest + 1, +2, etc.
3. Match the `displayIndex` to the entry's position in the list (or set to 0)

## Read-Only Zones
Extensions, plugins, and ST source code are read-only. Only write to `data/default-user/`.
