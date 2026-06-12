# SillyTavern-ClaudeFulcrum

**[WIP]**

A Claude Code task runner built into SillyTavern. Puts a floating panel inside ST that runs CC against your actual installation — filesystem access, tool use, CLAUDE.md awareness — and streams results back in real time.

This is not a chat UI. It is a direct channel to Claude Code with a mapped workspace, preset tasks, and a tier-gated approval flow for write operations.

Two components, one repo:

| Component | Path | Role |
|---|---|---|
| ST extension | `index.js` | Panel UI — displays output, captures input, communicates with plugin |
| ST plugin | `plugin/` | Task runner — spawns CC, streams events, enforces zone and tier rules |
| Sandbox | `sandbox/` | MCP tool server — provides shell, git, web, and filesystem tools to runners |

---

## Features

- **Preset task buttons** — one click to run a named, preconfigured task with predefined tools and context
- **Freeform command input** — type any prompt and run it in CC or Direct mode
- **Real-time streaming** — output appears as CC produces it via Server-Sent Events
- **Tier approval flow** — read-only tools auto-approved; write tools surface a prompt before execution; destructive tools always prompt
- **Zone enforcement** — ST code directories are permanently read-only regardless of approval; data directories are fully accessible
- **Tool Tiering Manager** — tier assignments are user-owned config; unknown tools from CC updates surface for assignment rather than failing silently
- **Two runners** — CC (full filesystem + tool use) and Direct (Anthropic API with sandbox tools)
- **Sandbox tools** — Direct runner has access to `read_file`, `write_file`, `list_directory`, `search_files`, `run_bash`, `git_status`, `git_diff`, `git_log`, `git_commit`, `web_fetch`
- **Session tracking** — reads `st_session.json` written by [Loggeryze](https://github.com/ZapoVerde/SillyTavern-Loggeryze); surfaces session ID and restart counter in task responses for debugging
- **Self-installing** — plugin installs its own npm dependencies on first run; no manual npm step required

---

## Prerequisites

- SillyTavern with server plugins enabled (`enableServerPlugins: true` in config)
- [SillyTavern-Loggeryze](https://github.com/ZapoVerde/SillyTavern-Loggeryze) server plugin (writes `st_session.json`)
- Node.js (included in ST Docker image)
- npm (included in ST Docker image and all standard Node installs)

---

## Installation

### 1. Extension

Install via ST's built-in extension manager, or drop the folder directly into ST's third-party extensions directory.

### 2. Plugin

Download the latest `claudefulcrum-plugin.zip` from [GitHub releases](https://github.com/ZapoVerde/SillyTavern-ClaudeFulcrum/releases) and extract it into ST's plugins directory as `claudefulcrum/`:

```
ST plugins directory/
└── claudefulcrum/        ← extracted plugin folder
    ├── index.js
    ├── package.json
    └── ...
```

**Windows (rawdog):** `%APPDATA%\SillyTavern\plugins\` or wherever your ST data lives.
**Linux/Mac (rawdog):** `~/.config/SillyTavern/plugins/` or your ST data directory.
**Docker:** see the Docker section below.

Restart ST. On first startup the plugin installs its own npm dependencies automatically — this takes 30-60 seconds. Subsequent startups are instant.

### 3. Authentication

Either:

**Claude Pro OAuth** (recommended) — click "Authenticate" in the panel, complete the flow, paste the code back. Persist the session across container restarts:

```yaml
# In compose.yaml
volumes:
  - ./st-data/claude-auth:/home/node/.claude
```

**API key** — set `ANTHROPIC_API_KEY` in your environment.

---

## Docker installation

Add the plugin folder to your compose volume mounts. The plugin directory is included in the extension repo under `plugin/` — for Docker users, the recommended setup is a symlink so there is one copy of the code:

```bash
ln -s ../../st-extensions/SillyTavern-ClaudeFulcrum/plugin st-plugins/claudefulcrum
```

On first ST start the plugin self-installs into the mounted volume and persists across restarts.

---

## Usage

Open the panel via the **ClaudeFulcrum** entry in ST's Extensions menu (or the ⚡ wand button). The status dot shows whether the `claude` binary is ready.

- **Preset buttons** — run a named task; tools and context are predefined
- **Text input** — type a freeform command and press Enter or Send
- **Mode toggle** — CC (full Claude Code) or Direct (Anthropic API with sandbox tools)
- **Approval bar** — appears when a task needs write access; approve or deny inline
- **Stop** — cancels the running task

---

## Repo structure

```
SillyTavern-ClaudeFulcrum/
├── CLAUDE.md                   Workspace map — loaded by CC on every run
├── manifest.json
├── index.js                    Extension entry — panel UI
├── style.css
├── window.html
├── context/                    Context files injected by preset
├── plugin/                     ST server plugin
│   ├── index.js                Plugin entry
│   ├── installer.js            Self-installer — auto-runs npm install on first start
│   ├── sse-server.js           Task registry + SSE routes
│   ├── context-assembler.js    Workspace map + preset + prompt composition
│   ├── runner-factory.js
│   ├── sandbox-manager.js      MCP client + filesystem proxy tool routing
│   ├── runners/
│   │   ├── cc.js               CC runner (stream-json)
│   │   └── direct.js           Direct Anthropic SDK runner with tool loop
│   ├── tools/
│   │   └── filesystem-proxy.js read_file, write_file, list_directory, search_files
│   ├── approval/
│   │   ├── tier-gate.js        Tool classification + approval bridge
│   │   └── tool-tiers.json     User-owned tier assignments
│   └── presets/
├── sandbox/                    MCP tool server
│   ├── server.js               Entry — stdio (rawdog) or HTTP+SSE (Docker)
│   ├── registry.js             Registers tools with MCP server
│   ├── tools/
│   │   ├── shell.js            run_bash
│   │   ├── git.js              git_status, git_diff, git_log, git_commit
│   │   └── web.js              web_fetch
│   └── transport/
│       └── http.js             HTTP+SSE transport for Docker mode
└── docs/
    ├── principles.md
    ├── architecture.md
    └── troubleshooting.md
```

`st-plugins/claudefulcrum` is a symlink to `plugin/` for dev installs. One copy, no sync step.

---

## Docs

- [Architecture](docs/architecture.md) — component diagram, sandbox model, request flow, zone model, runner details
- [Principles](docs/principles.md) — design intent and constraints
- [Troubleshooting](docs/troubleshooting.md) — startup verification, CSRF 403, SSE connection issues
