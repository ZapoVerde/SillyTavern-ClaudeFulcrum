# Character Card Format

## Location
`data/default-user/characters/` relative to ST app root (`/home/node/app`).

Cards are `.png` files with JSON embedded in the PNG `tEXt` chunk (key `chara`, base64-encoded). CC cannot write binary PNG files. **Create cards as `.json` files instead** — ST loads them identically.

File naming: `CharacterName.json`. Spaces are fine.

## JSON Structure (Chara Card V3)

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "name": "CharacterName",
  "description": "Physical appearance, background, occupation...",
  "personality": "Core personality traits (brief)",
  "scenario": "Default scenario / setting context",
  "first_mes": "Opening message {{char}} sends. Use {{user}} and {{char}} as placeholders.",
  "mes_example": "<START>\n{{char}}: example dialogue\n{{user}}: example reply",
  "tags": [],
  "fav": false,
  "creator": "",
  "data": {
    "name": "CharacterName",
    "description": "Same as top-level description",
    "personality": "",
    "first_mes": "Same as top-level first_mes",
    "mes_example": "",
    "scenario": "",
    "creator_notes": "Author notes / usage guidance",
    "system_prompt": "",
    "post_history_instructions": "",
    "alternate_greetings": [],
    "tags": [],
    "creator": "",
    "character_version": "",
    "extensions": {},
    "character_book": null
  }
}
```

`data` is the V2/V3 canonical object. Top-level fields are V1 compatibility — keep them in sync with `data`.

## Key Field Guide

| Field | Purpose |
|-------|---------|
| `description` | Main character definition — appearance, backstory, personality. This is the largest field. |
| `personality` | Optional short trait summary (some frontends use this separately) |
| `first_mes` | The character's opening message. Can be multi-paragraph. |
| `mes_example` | Example dialogue showing character voice. Use `<START>` marker between exchanges. |
| `scenario` | Scene/context setting injected into every chat |
| `system_prompt` | Overrides the global system prompt for this character |
| `post_history_instructions` | Injected after chat history |
| `alternate_greetings` | Array of strings — additional opening messages user can swipe to |
| `character_book` | Embedded lorebook (see lorebook-format.md). Set to `null` if not needed. |

## Placeholder Tokens
- `{{char}}` — replaced with the character's name
- `{{user}}` — replaced with the user's name

## Read-Only Zones
Extensions, plugins, and ST source code are read-only. Only write to `data/default-user/`.
