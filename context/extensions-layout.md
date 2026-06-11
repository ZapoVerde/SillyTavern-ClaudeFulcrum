# ST Extensions Layout

Third-party extensions live at `public/scripts/extensions/third-party/` relative to ST app root.

## Known Extensions

| Directory | Purpose |
|-----------|---------|
| `SillyTavern-Canonize/` | CNZ narrative engine — world state tracking, RAG, lorebook sync |
| `SillyTavern-ClaudeFulcrum/` | This extension — CC task runner |
| `SillyTavern-Characteryze/` | Character card editor with forge/workbench workflow |
| `SillyTavern-Loggeryze/` | Console log capture and token profiler |
| `SillyTavern-Sanityze/` | Sanity checks and diagnostics |
| `SillyTavern-Personalyze/` | Image generation (Fal, PiAPI, Runware) |
| `SillyTavern-Structurize/` | Structure/formatting tools |
| `SillyTavern-mobilyze/` | Mobile UI adjustments |

## Extension Structure

Each extension directory contains at minimum:
- `manifest.json` — display name, version, JS/CSS entry points
- `index.js` — browser-side JavaScript (IIFE pattern)
- `style.css` — styles

Extensions with server-side components also have:
- `plugin/` or `server/` — Node.js plugin code (symlinked into `plugins/`)
