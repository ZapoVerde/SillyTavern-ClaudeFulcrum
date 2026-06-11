# ClaudeFulcrum — Architecture
*Structural decisions that future code must remain consistent with.*

---

## Purpose

ClaudeFulcrum is a power-user task runner for SillyTavern. It puts Claude Code's filesystem access, tool use, and reasoning capability into a floating panel inside ST. The user types a command or clicks a preset — ClaudeFulcrum executes it against the actual ST installation and streams results back in real time.

This is not a chat UI. It is not a wrapper around ST's existing AI connection. It is a direct channel to Claude Code, operating with awareness of the local filesystem, workspace map, and the full ST stack.

---

## Components

```
┌──────────────────────────────────────────────────────────┐
│  SillyTavern (browser)                                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ClaudeFulcrum Panel (ST Extension)                │  │
│  │                                                    │  │
│  │  • Floating panel UI                               │  │
│  │  • Preset task buttons                             │  │
│  │  • Freeform command input                          │  │
│  │  • Streaming output renderer                       │  │
│  │  • Tier approval prompts                           │  │
│  │  • Permission state indicator                      │  │
│  │  • Mode selector (CC / Direct)                     │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ WebSocket                      │
└──────────────────────────┼───────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────┐
│  SillyTavern Server (Node.js)                            │
│                                                          │
│  ┌────────────────────────▼───────────────────────────┐  │
│  │  ClaudeFulcrum Plugin                              │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  WebSocket Handler                           │  │  │
│  │  └────────────────────┬─────────────────────────┘  │  │
│  │                       │                             │  │
│  │  ┌────────────────────▼─────────────────────────┐  │  │
│  │  │  Context Assembler                           │  │  │
│  │  │  (workspace map + preset tools + task def)   │  │  │
│  │  └────────────────────┬─────────────────────────┘  │  │
│  │                       │                             │  │
│  │  ┌────────────────────▼─────────────────────────┐  │  │
│  │  │  Runner Factory                              │  │  │
│  │  └──────────────┬──────────────┬────────────────┘  │  │
│  │                 │              │                    │  │
│  │  ┌──────────────▼──┐  ┌────────▼────────┐          │  │
│  │  │   CC Runner     │  │  Direct Runner  │          │  │
│  │  └──────────────┬──┘  └────────┬────────┘          │  │
│  │                 │              │                    │  │
│  │  ┌──────────────▼──────────────▼────────────────┐  │  │
│  │  │  Tool Event Interceptor                      │  │  │
│  │  │  (tier gate + approval bridge)               │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
  ┌───────────────┐            ┌──────────────────┐
  │  claude CLI   │            │  Anthropic API   │
  │  (CC process) │            │  (direct runner) │
  └───────────────┘            └──────────────────┘
```

---

## The Context System

Before any task reaches a runner, the Context Assembler composes three artifacts into the prompt CC receives. These are the mechanism that makes ClaudeFulcrum reliable rather than exploratory.

### Workspace Map
A structured description of this ST installation: where core directories live, where extensions and plugins are, where character cards and chat files are stored, where lorebooks are, and any conventions specific to this stack. CC consults this map when it needs to find anything. It is user-maintained and stored in `context/` in the repo.

The `CLAUDE.md` at the repo root is the baseline workspace map — CC loads it automatically for every run. Additional context files in `context/` are injected selectively by preset.

### Preset Tools
Each preset explicitly declares the tools CC is permitted to use for that task. A read-only audit declares only read tools. A repair task adds write tools. Nothing is implied. The declaration is the authorization.

### Preset Tasks
Named, reusable task definitions. Each preset bundles:
- A prompt template
- A tool declaration
- A list of context files to inject from `context/`

A preset is the unit of repeatable capability. Writing a preset is a design act — it encodes domain knowledge about what a task needs and what it must not touch.

---

## Plugin Communication

The plugin registers routes on ST's existing Express server via the router ST provides. No separate port. No ST internals required.

- **SSE endpoint** — `GET /api/plugins/claudefulcrum/stream?taskId=xxx` — streams task events to the panel
- **Task start** — `POST /api/plugins/claudefulcrum/run` — starts a task, returns a `taskId`
- **Approval response** — `POST /api/plugins/claudefulcrum/approve` — sends user's approval decision for a pending tool request
- **Cancel** — `POST /api/plugins/claudefulcrum/cancel` — aborts a running task

The panel opens an SSE connection per task and uses `fetch()` for control messages. Each task runs concurrently — multiple tasks can be active simultaneously, each with its own subprocess and SSE stream.

---

## Request Flow

1. User clicks a preset or types a freeform command
2. Panel POSTs `{ prompt, mode, taskType, sessionApprovals }` to `/run`; receives a `taskId`
3. Panel opens SSE connection for that `taskId`
4. Context Assembler resolves the preset, loads workspace map and declared context files, composes the full prompt
5. Runner Factory selects CC or Direct runner based on `mode`
6. CC runner spawns `claude --output-format stream-json` (no `-p` flag — stays interactive); Tier 1 tools pre-authorized via `--allowedTools`
7. Events stream through SSE to the panel as they arrive; output renders in real time
8. When CC requests a Tier 2 or 3 tool, the interceptor catches the stream-json permission event, pauses (holds stdin), and sends an approval request via SSE
9. Panel renders the approval prompt inline; user approves or denies; panel POSTs decision to `/approve`
10. Plugin pipes decision to CC's stdin; CC resumes or aborts
11. Completion or process exit signals end of stream; panel shows final state; invocation written to log

---

## Authentication

ClaudeFulcrum supports two auth methods. The plugin detects which is active at startup and displays status in the panel. If neither is configured, the panel prompts the user to authenticate before any task can run.

### Method A — Claude Pro OAuth (primary)
The `claude auth login` flow, surfaced entirely within the ClaudeFulcrum panel:

1. User clicks "Authenticate" in the panel
2. Plugin spawns `claude auth login`
3. CC outputs a URL — panel renders it as a clickable link
4. User authenticates on claude.ai, receives a code
5. User pastes code into the panel
6. Plugin pipes it to CC's stdin; CC stores the session in `~/.claude/`
7. Panel shows "Connected"

Requires one line in `docker-compose.yml` so the session survives container restarts:
```yaml
volumes:
  - ~/.claude:/root/.claude
```

### Method B — API key (fallback)
Set `ANTHROPIC_API_KEY` in the `.env` file alongside `docker-compose.yml`. The plugin injects it into CC's environment at spawn time. No volume mount required.

### Detection order
1. Check for valid session in `~/.claude/` — use OAuth session
2. Check for `ANTHROPIC_API_KEY` in environment — use API key
3. Neither present — surface the OAuth flow in the panel

The credential never leaves the server-side plugin. The browser extension never sees it.

---

## The Two Runners

### CC Runner
Spawns `claude -p` with `--output-format stream-json`. Reads events from stdout line by line. Tier 1 tools are passed via `--allowedTools`; all other tool use events are intercepted and routed through the approval flow before CC is allowed to proceed.

Full CC capabilities: filesystem access, Bash, CLAUDE.md awareness, memory, all built-in tools.

### Direct Runner
Calls the Anthropic SDK with streaming. No tools — pure conversational Claude. No filesystem access, no CLAUDE.md loading.

Used for quick questions that don't need CC's power, or when CC usage is exhausted.

Both runners implement the same interface: receive an assembled prompt, yield a stream of events, signal completion or error. The WebSocket handler does not know which runner it is using.

---

## Zone Model

All paths in the ST installation fall into one of two permanent zones. The plugin enforces this boundary before the tier gate runs — no approval prompt can override it.

### Code zones — read-only always
| Zone | `process.cwd()` relative path |
|------|-------------------------------|
| ST core | `.` (app root, excluding `data/`) |
| Extensions | `public/scripts/extensions/third-party/` |
| Plugins | `plugins/` |

Any write, modify, or delete attempt targeting a code zone path is hard-denied. The operation never reaches the tier gate, never surfaces as an approval prompt, and is logged as a zone violation.

### Data zones — full access, tier-gated
| Zone | `process.cwd()` relative path |
|------|-------------------------------|
| Character cards | `data/default-user/characters/` |
| Chat files | `data/default-user/chats/` |
| Lorebooks | `data/default-user/worlds/` |
| Images | `data/default-user/user/images/` |
| Settings | `data/default-user/settings.json`, `data/default-user/user-settings.yaml` |
| Presets | `data/default-user/presets/` |
| Themes | `data/default-user/themes/` |
| Context templates | `data/default-user/context/` |

Operations on data zone paths proceed through the normal tier approval flow.

The workspace map declares both zones to CC at task start so CC plans accordingly and does not attempt code zone writes.

---

## Tool Tiering Manager

Tool tier assignments are user-owned config, not hardcoded logic. They live in `plugin/tool-tiers.json` and are editable via a settings panel in the ClaudeFulcrum UI.

**Structure of `tool-tiers.json`:**
```json
{
  "tier1": ["Read", "Glob", "LS"],
  "tier2": ["Bash", "Write", "Edit"],
  "tier3": ["Delete"],
  "unknown_default": "tier2"
}
```

**The unclassified list:** When the interceptor encounters a tool not present in any tier, it applies `unknown_default` (Tier 2), executes the approval flow, and records the tool name as unclassified. The Tool Tiering Manager surfaces these after the session: "CC used `TodoWrite` — not yet assigned. Treat as Tier 1 / 2 / 3?"

**The update path:** Update CC → run a task → open Tool Tiering Manager → assign any tools in the unclassified list → done. No ClaudeFulcrum release required to handle new CC tools.

The settings panel shows: current CC version, all known tools by tier (reassignable), unclassified tools from recent sessions.

---

## Approval Flow

The interceptor reads each tool use event from the runner stream and classifies it:

| Tier | Examples | Behavior |
|------|----------|----------|
| 1 — Read-only | Read, Glob, LS | Auto-approved; no panel entry |
| 2 — Stateful | Bash, Write | Panel prompt; approve once or for session |
| 3 — Destructive | Delete, overwrite of unknown paths, destructive flags | Panel prompt; never session-approved |

On Tier 2 or 3: the plugin pauses the CC process (holds stdin), sends a readable description of the requested operation to the panel, and waits. The user approves or denies. The plugin resumes or aborts.

The panel's permission state indicator shows what has been approved in the current session.

---

## Repo Structure

```
SillyTavern-ClaudeFulcrum/
├── CLAUDE.md                       Baseline workspace map — loaded by CC on every run
├── manifest.json                   ST extension manifest
├── index.js                        Extension entry — panel UI, WebSocket client
├── style.css                       Panel styles
├── window.html                     Panel HTML template
│
├── context/                        Selective context files injected by preset
│   ├── st-layout.md                ST core directory structure
│   ├── cnz-layout.md               CNZ paths and conventions
│   ├── extensions-layout.md        Extensions directory map
│   └── plugins-layout.md           ST plugins directory map
│
├── plugin/                         ST plugin — server-side, runs inside ST
│   ├── index.js                    Plugin entry — exports info/init/exit for ST plugin API; registers routes
│   ├── ws-server.js                WebSocket handler — receives requests, streams responses
│   ├── context-assembler.js        Composes workspace map + preset context + prompt
│   ├── runner-factory.js           Selects runner based on mode
│   ├── runners/
│   │   ├── cc.js                   CC runner — spawns claude -p, reads stream-json
│   │   └── direct.js               Direct runner — Anthropic SDK streaming
│   ├── approval/
│   │   ├── tier-gate.js            Tool event interceptor — classification + approval bridge
│   │   └── tool-tiers.json         User-owned tier assignments — ships with defaults
│   └── presets/
│       └── index.js                Preset definitions — prompt, tools, context files
│
└── docs/
    ├── principles.md
    ├── architecture.md             ← this file
    ├── runners.md
    ├── presets.md
    ├── installation.md
    └── settings.md
```

`st-plugins/claudefulcrum` in the ST installation is a symlink to `plugin/`. One copy of the code; no sync step.

---

## Portability

ClaudeFulcrum must work identically in a Docker installation and a bare host installation. The rules that guarantee this:

**All paths are anchored to `process.cwd()`.**
ST always sets its working directory to the app root — in Docker (`/home/node/app`) and on a bare host alike. Every path in the plugin is resolved via `path.resolve(process.cwd(), '...')`. No absolute paths. No `~` expansion. No hardcoded `/home/node/...`. If a path cannot be expressed relative to `process.cwd()`, it does not belong in the plugin.

**The `claude` binary is a local npm dependency, not a global install.**
CC is declared as a dependency in `plugin/package.json`. The binary lives at `node_modules/.bin/claude` relative to the plugin directory — inside the mounted `st-plugins/` volume, so it survives container restarts. The plugin resolves the binary path relative to `__dirname` at startup. No global PATH dependency, no `which claude`, works identically in Docker and bare install.

**Auth detection is environment-agnostic.**
The detection order (session → env var → prompt) works in both environments. For Docker, the `~/.claude/` session is persisted by adding one volume mount to `compose.yaml`:
```yaml
- ./st-data/claude-auth:/home/node/.claude
```
The plugin code contains no Docker-specific logic.

**Zone paths are relative.**
Code zone and data zone paths are defined as relative paths from `process.cwd()`. The zone enforcement resolves them to absolute paths at startup using the same anchor. A bare install and a Docker install with different app roots produce correct absolute paths from the same relative definitions.

**Confirmed path map (from compose.yaml):**
| What | Host path | Container path | `process.cwd()` relative |
|------|-----------|----------------|--------------------------|
| ST source | `./st-source` | `/home/node/app` | `.` |
| Extensions | `./st-extensions` | `/home/node/app/public/scripts/extensions/third-party` | `public/scripts/extensions/third-party` |
| Plugins | `./st-plugins` | `/home/node/app/plugins` | `plugins` |
| Data | `./st-data` | `/home/node/app/data` | `data` |

---

## Resilience

Each CC subprocess is isolated — a crash in one task does not affect others. The plugin monitors each subprocess's exit event. On unexpected exit, it marks the task failed, sends a final error event to the panel via SSE, and closes the stream. The panel shows the failure inline.

## Invocation Log

Every task is appended to `data/default-user/user/files/claudefulcrum_log.json` on completion. Format follows Loggeryze's pattern — `path.resolve(process.cwd(), 'data/...')`. Each entry records: timestamp, taskId, preset name or freeform, mode, tools requested, tools approved, outcome (complete / aborted / error).

The log is append-only. The panel can surface recent entries in a history view.

---

## What ClaudeFulcrum Is Not

- **Not a chat UI.** It has a text input, but the design center is preset tasks. The input is for one-off commands.
- **Not a replacement for ST's AI connection.** ST's existing LLM setup is untouched. ClaudeFulcrum runs alongside it.
- **Not a general-purpose agent framework.** It is purpose-built for ST operations: audits, health checks, plugin management, character work. Scope creep beyond that should be resisted.
