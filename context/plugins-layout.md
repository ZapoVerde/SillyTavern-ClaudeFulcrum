# ST Plugins Layout

Server-side plugins live at `plugins/` relative to ST app root.

## Structure

Each plugin is either a directory or a symlink to a directory. ST loads plugins by importing `index.js` from each subdirectory.

Required exports from every valid plugin:
```js
export const info = { id, name, description };
export async function init(router) { ... }
export async function exit() { ... }
```

## Installed Plugins

| Plugin dir | Points to | Purpose |
|-----------|-----------|---------|
| `plugins/claudefulcrum` | `public/scripts/extensions/third-party/SillyTavern-ClaudeFulcrum/plugin/` | This plugin |
| `plugins/loggeryze-server` | `public/scripts/extensions/third-party/SillyTavern-Loggeryze/server/` | Console log capture |
| `plugins/sanityze` | `public/scripts/extensions/third-party/SillyTavern-Sanityze/plugin/` | Sanity checks |
| `plugins/personalyze` | `public/scripts/extensions/third-party/SillyTavern-Personalyze/plugin/` | Image generation proxy |

## Symlink Pattern

All symlinks use paths relative to the `plugins/` directory:
`../public/scripts/extensions/third-party/<ExtensionName>/<subdir>`
