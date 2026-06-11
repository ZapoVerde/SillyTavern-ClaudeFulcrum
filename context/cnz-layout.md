# Canonize (CNZ) Layout

CNZ is the narrative engine extension. It maintains a canonical world state record embedded in chat messages.

## Paths

| What | Path |
|------|------|
| Extension root | `public/scripts/extensions/third-party/SillyTavern-Canonize/` |
| Plugin root | `plugins/claudefulcrum/` (symlink) or `public/scripts/extensions/third-party/SillyTavern-Canonize/plugin/` |
| CNZ docs | `public/scripts/extensions/third-party/SillyTavern-Canonize/docs/` |
| Hookseeker audit guide | `public/scripts/extensions/third-party/SillyTavern-Canonize/docs/hookseeker-audit.md` |

## Key Concepts

**Hookseeker** — extracts narrative hooks from chat messages and writes them to hidden message metadata. Output fields appear as JSON in the `extra` field of chat messages.

**Anchors** — sync points embedded in chat message metadata. Each anchor is a complete world state snapshot. Field: `extra.cnz_anchor`.

**Chunk headers** — lorebook entries written by CNZ with a structured header format. Identified by the CNZ namespace prefix in the entry comment or key field.

**Chat file location** — `data/default-user/chats/<CharacterName>/<timestamp>.jsonl` — JSONL format, one message object per line.

## Hookseeker Output Fields to Check

When auditing hookseeker output, look for these fields in recent chat message `extra` objects:
- `cnz_hooks` — array of extracted hooks
- `cnz_anchor` — anchor data (only on sync messages)
- `cnz_chunk_id` — chunk identifier for lorebook entries written by CNZ

## Common Issues

- Missing `cnz_hooks` on recent messages → hookseeker not running or interceptor not firing
- `cnz_anchor` absent on expected sync messages → sync not completing
- Lorebook entries without CNZ namespace prefix → not written by CNZ or prefix stripped
