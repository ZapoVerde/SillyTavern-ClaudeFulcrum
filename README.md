# SillyTavern-ClaudeFulcrum

**[WIP]**

A Claude Code task runner built into SillyTavern. Puts a floating panel inside ST that runs CC against your actual installation — filesystem access, tool use, CLAUDE.md awareness — and streams results back in real time.

This is not a chat UI. It is a direct channel to Claude Code with a mapped workspace, preset tasks, and a tier-gated approval flow for write operations.

Two components, one repo:

| Component | Path | Role |
|---|---|---|
| ST extension | `index.js` | Panel UI — displays output, captures input, communicates with plugin |
| ST plugin | `plugin/` | Task runner — spawns CC, streams events, enforces zone and tier rules |

---

## Features

- **Preset task buttons** — one click to run a named, preconfigured task with predefined tools and context
- **Freeform command input** — type any prompt and run it in CC or Direct mode
- **Real-time streaming** — output appears as CC produces it via Server-Sent Events
- **Tier approval flow** — read-only tools auto-approved; write tools surface a prompt before execution; destructive tools always prompt
- **Zone enforcement** — ST code directories are permanently read-only regardless of approval; data directories are fully accessible
- **Tool Tiering Manager** — tier assignments are user-owned config; unknown tools from CC updates surface for assignment rather than failing silently
- **Two runners** — CC (full filesystem + tool use) and Direct (Anthropic SDK, conversational only)
- **Session tracking** — reads `st_session.json` written by [Loggeryze](https://github.com/ZapoVerde/SillyTavern-Loggeryze); surfaces session ID and restart counter in task responses for debugging

---

## Prerequisites

- SillyTavern with server plugins enabled (`enableServerPlugins: true` in config)
- [SillyTavern-Loggeryze](https://github.com/ZapoVerde/SillyTavern-Loggeryze) server plugin (writes `st_session.json`)
- Node.js (included in ST Docker image)

---

## Installation

### 1. Extension

Drop into ST's third-party extensions directory:

```
st-extensions/SillyTavern-ClaudeFulcrum/
```

Or install via ST's built-in extension manager.

### 2. Plugin

The companion server plugin lives in `plugin/`. Link it into ST's plugins directory:

```bash
ln -s ../../st-extensions/SillyTavern-ClaudeFulcrum/plugin st-plugins/claudefulcrum
```

Install plugin dependencies:

```bash
cd st-plugins/claudefulcrum && npm install
```

This installs the `claude` binary locally — no global install needed.

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

## Usage

Open the panel via the **ClaudeFulcrum** entry in ST's Extensions menu (or the ⚡ wand button). The status dot shows whether the `claude` binary is ready.

- **Preset buttons** — run a named task; tools and context are predefined
- **Text input** — type a freeform command and press Enter or Send
- **Mode toggle** — CC (full Claude Code) or Direct (Anthropic API, no filesystem)
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
│   ├── sse-server.js           Task registry + SSE routes
│   ├── context-assembler.js    Workspace map + preset + prompt composition
│   ├── runner-factory.js
│   ├── runners/
│   │   ├── cc.js               CC runner (stream-json)
│   │   └── direct.js           Direct Anthropic SDK runner
│   ├── approval/
│   │   ├── tier-gate.js        Tool classification + approval bridge
│   │   └── tool-tiers.json     User-owned tier assignments
│   └── presets/
└── docs/
    ├── principles.md
    ├── architecture.md
    └── troubleshooting.md
```

`st-plugins/claudefulcrum` is a symlink to `plugin/`. One copy, no sync step.

---

## Docs

- [Architecture](docs/architecture.md) — component diagram, request flow, zone model, runner details
- [Principles](docs/principles.md) — design intent and constraints
- [Troubleshooting](docs/troubleshooting.md) — startup verification, CSRF 403, SSE connection issues
