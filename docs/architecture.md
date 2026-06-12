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
│                          │ SSE + fetch                    │
└──────────────────────────┼───────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────┐
│  SillyTavern Server (Node.js)                            │
│                                                          │
│  ┌────────────────────────▼───────────────────────────┐  │
│  │  ClaudeFulcrum Plugin                              │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  SSE Server + Task Registry                  │  │  │
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
│  │  │  Tier Gate + Approval Bridge                 │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Sandbox Manager                             │  │  │
│  │  │  • Filesystem proxy (read/write/list/search) │  │  │
│  │  │  • MCP client → cfm-sandbox subprocess       │  │  │
│  │  └──────────────────────┬───────────────────────┘  │  │
│  └────────────────────────┼────────────────────────────┘  │
└───────────────────────────┼───────────────────────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
  ┌───────────────┐  ┌─────────────┐   ┌──────────────────┐
  │  claude CLI   │  │ cfm-sandbox │   │  Anthropic API   │
  │  (CC process) │  │ (MCP stdio) │   │  (direct runner) │
  └───────────────┘  └─────────────┘   └──────────────────┘
```

---

## The Sandbox

The sandbox is a Node.js MCP server that provides tools to runners. It ships inside the plugin package and requires no separate installation.

### Why a sandbox exists

The Direct runner calls the Anthropic API directly. Without a tool server, it is conversational-only — no filesystem access, no shell, no git. The sandbox gives Direct the same class of capabilities CC has natively, so the two runners are genuine peers rather than CC being vastly more capable.

### Tool split: sandbox vs. plugin-side proxy

Tools are split across two executors for a structural reason:

**Sandbox tools** (`run_bash`, `git_*`, `web_fetch`) run inside the sandbox subprocess. For Docker users a future version can run these in an isolated container.

**Filesystem proxy tools** (`read_file`, `write_file`, `list_directory`, `search_files`) run inside the plugin process. They cannot run in the sandbox because the sandbox subprocess has no access to the ST filesystem — that filesystem is owned by the ST container. The plugin process does have access. `write_file` enforces the code zone boundary before writing.

The Sandbox Manager routes each tool call to the correct executor transparently. Runners call `callTool(name, args)` and never know which executor handled it.

### Transport

**Rawdog (stdio):** Sandbox runs as a child process spawned by the plugin. Communication is MCP over stdin/stdout. No port, no network configuration.

**Docker (HTTP+SSE):** Sandbox runs as a separate container on the same Docker network. Communication is MCP over HTTP+SSE on port 7860. The plugin connects via `CFM_SANDBOX_URL`. This is Phase 4 — not yet deployed.

### Protocol

MCP (Model Context Protocol) — Anthropic's standard for AI-to-tool communication. JSON-RPC 2.0 over the chosen transport. Tool definitions use the same JSON Schema input format the Anthropic API uses natively, so tool definitions can be passed to `messages.create()` without conversion beyond field renaming.

---

## Installation Model

### Distribution

ClaudeFulcrum has two distributable artifacts:

**Extension** — installed via ST's extension manager (GitHub URL). Browser-side only. No server component.

**Plugin** — downloaded as `claudefulcrum-plugin.zip` from GitHub releases. Contains `plugin/` and `sandbox/` but not `node_modules/`. Users extract it into ST's plugins directory.

These are separate artifacts with separate version numbers that must be kept in sync.

### Self-install on first run

The plugin detects missing npm packages on every `init()` call and runs `npm install` in its own directory if any sentinel packages are absent. This means:

- New users: drop folder into plugins, restart ST, wait 30-60 seconds for the first-run install, done
- No manual npm step at any point
- The sandbox and its dependencies install automatically as part of this single npm install (sandbox is a `file:../sandbox` dependency in `plugin/package.json`)

### Dev setup (symlink)

Developers use a symlink from the ST plugins directory into the extension repo:

```bash
ln -s ../../st-extensions/SillyTavern-ClaudeFulcrum/plugin st-plugins/claudefulcrum
```

The self-installer detects the real path via `import.meta.url` after symlink resolution, so npm installs into the correct location. Dev and dist behaviour are identical.

### Self-update

Once the plugin is loaded it has filesystem access to its own directory. The extension detects version mismatch (plugin version vs. extension's expected version) and offers an "Update Plugin" button. The plugin copies new files from the extension directory into its own location and prompts for ST restart. Manual recovery if the copy fails: delete the plugin folder, re-extract the zip.

---

## Plugin Communication

The plugin registers routes on ST's existing Express server via the router ST provides. No separate port.

| Route | Method | Purpose |
|---|---|---|
| `/api/plugins/claudefulcrum/stream` | GET | SSE stream for a running task (`?taskId=xxx`) |
| `/api/plugins/claudefulcrum/run` | POST | Start a task; returns `taskId` |
| `/api/plugins/claudefulcrum/approve` | POST | Send approval decision for a pending tool request |
| `/api/plugins/claudefulcrum/cancel` | POST | Abort a running task |
| `/api/plugins/claudefulcrum/presets` | GET | List available presets |
| `/api/plugins/claudefulcrum/status` | GET | CC binary status + unclassified tools |
| `/api/plugins/claudefulcrum/sandbox-status` | GET | Sandbox connection state + available tools |

---

## Request Flow

1. User clicks a preset or types a freeform command
2. Panel POSTs `{ prompt, mode, presetId }` to `/run`; receives a `taskId`
3. Panel opens SSE connection for that `taskId`
4. Context Assembler resolves the preset, loads workspace map and declared context files, composes the full prompt
5. Runner Factory selects CC or Direct runner based on `mode`
6. **CC runner:** spawns `claude -p` with `--output-format stream-json`; Tier 1 tools pre-authorized via `--allowedTools`; events stream through SSE to the panel
7. **Direct runner:** calls Anthropic SDK with tool definitions from Sandbox Manager; handles `tool_use` stop events by dispatching through `callTool()`, feeding results back as `tool_result`, looping until `end_turn`
8. When a Tier 2 or 3 tool is requested (CC runner), the tier gate pauses the process and sends an approval request via SSE
9. Panel renders the approval prompt inline; user approves or denies; panel POSTs decision to `/approve`
10. Completion or process exit signals end of stream; panel shows final state; invocation written to log

---

## Authentication

ClaudeFulcrum supports two auth methods. The plugin detects which is active at startup.

### Method A — Claude Pro OAuth (primary)
The `claude auth login` flow, surfaced entirely within the ClaudeFulcrum panel:

1. User clicks "Authenticate" in the panel
2. Plugin spawns `claude auth login`
3. CC outputs a URL — panel renders it as a clickable link
4. User authenticates on claude.ai, receives a code
5. User pastes code into the panel
6. Plugin pipes it to CC's stdin; CC stores the session in `~/.claude/`

Persist session across Docker container restarts:
```yaml
volumes:
  - ./st-data/claude-auth:/home/node/.claude
```

### Method B — API key (fallback)
Set `ANTHROPIC_API_KEY` in the environment. The plugin injects it into CC's environment at spawn time.

### Detection order
1. Valid session in `~/.claude/` — OAuth session
2. `ANTHROPIC_API_KEY` in environment — API key
3. Neither — surface OAuth flow in the panel

---

## The Two Runners

### CC Runner
Spawns `claude -p` with `--output-format stream-json`. Reads events from stdout line by line. Tier 1 tools are passed via `--allowedTools`; all other tool use events are intercepted and routed through the approval flow.

Full CC capabilities: filesystem access, Bash, CLAUDE.md awareness, memory, all built-in tools.

### Direct Runner
Calls the Anthropic SDK with streaming and a full agentic tool loop. Fetches tool definitions from the Sandbox Manager on each run. When the model emits `tool_use` blocks, dispatches through `callTool()`, feeds results back as `tool_result`, loops until `end_turn`.

Available tools: `read_file`, `write_file`, `list_directory`, `search_files` (filesystem proxy), `run_bash`, `git_status`, `git_diff`, `git_log`, `git_commit`, `web_fetch` (sandbox MCP).

Both runners implement the same interface: receive an assembled prompt, yield a stream of events, signal completion or error. The SSE server does not know which runner it is using.

---

## Zone Model

All paths fall into one of two permanent zones. The plugin enforces this before the tier gate — no approval can override it.

### Code zones — read-only always
| Zone | `process.cwd()` relative path |
|------|-------------------------------|
| ST core | `.` (app root, excluding `data/`) |
| Extensions | `public/scripts/extensions/third-party/` |
| Plugins | `plugins/` |

### Data zones — full access, tier-gated
| Zone | `process.cwd()` relative path |
|------|-------------------------------|
| Character cards | `data/default-user/characters/` |
| Chat files | `data/default-user/chats/` |
| Lorebooks | `data/default-user/worlds/` |
| Images | `data/default-user/user/images/` |
| Settings | `data/default-user/settings.json` |
| Presets | `data/default-user/presets/` |
| Themes | `data/default-user/themes/` |

The filesystem proxy's `write_file` enforces code zone rejection independently of the tier gate.

---

## Tool Tiering

| Tier | Examples | Behavior |
|------|----------|----------|
| 1 — Read-only | Read, Glob, LS | Auto-approved |
| 2 — Stateful | Bash, Write | Panel prompt; approve once or for session |
| 3 — Destructive | Delete, destructive flags | Panel prompt; never session-approved |

Tier assignments live in `plugin/approval/tool-tiers.json` — user-owned config, not hardcoded. Unknown tools default to Tier 2 and surface for assignment.

---

## Repo Structure

```
SillyTavern-ClaudeFulcrum/
├── CLAUDE.md                       Baseline workspace map
├── manifest.json
├── index.js                        Extension entry — panel UI
├── style.css
├── window.html
│
├── context/                        Selective context files injected by preset
│
├── plugin/                         ST server plugin
│   ├── index.js                    Plugin entry — init/exit + dep check
│   ├── installer.js                Self-installer — npm install on first run
│   ├── sse-server.js               Task registry + all HTTP routes
│   ├── context-assembler.js        Prompt composition
│   ├── runner-factory.js           Runner selection
│   ├── sandbox-manager.js          MCP client + filesystem proxy routing
│   ├── logger.js                   Invocation log writer
│   ├── runners/
│   │   ├── cc.js                   CC runner
│   │   └── direct.js               Direct runner with tool loop
│   ├── tools/
│   │   └── filesystem-proxy.js     Plugin-side filesystem tools
│   ├── approval/
│   │   ├── tier-gate.js            Zone resolution + tool classification
│   │   └── tool-tiers.json         User-owned tier assignments
│   └── presets/
│       └── index.js                Preset definitions
│
├── sandbox/                        MCP tool server (ships in plugin zip)
│   ├── package.json
│   ├── server.js                   Entry — stdio or HTTP mode
│   ├── registry.js                 Tool registration
│   ├── tools/
│   │   ├── shell.js                run_bash
│   │   ├── git.js                  git_status, git_diff, git_log, git_commit
│   │   └── web.js                  web_fetch
│   └── transport/
│       └── http.js                 HTTP+SSE transport (Docker, Phase 4)
│
└── docs/
    ├── principles.md
    ├── architecture.md             ← this file
    └── troubleshooting.md
```

---

## Portability

**All paths are anchored to `process.cwd()`.** ST always sets its working directory to the app root. No absolute paths, no `~` expansion.

**The `claude` binary is a local npm dependency.** Resolved relative to the plugin directory via `import.meta.url`. No global PATH dependency.

**Sandbox path resolution uses `import.meta.url`.** Follows symlinks correctly, so dev and dist installs behave identically.

**Auth detection is environment-agnostic.** Works in Docker and bare installs without environment-specific logic.

---

## Resilience

Each CC subprocess is isolated — a crash in one task does not affect others. The plugin monitors each subprocess's exit event. On unexpected exit it marks the task failed, sends a final error event via SSE, and closes the stream.

The sandbox connection is optional. If the sandbox fails to start (MCP SDK not yet installed, or subprocess error), the plugin continues: the filesystem proxy tools remain available, MCP tools are absent. The `/sandbox-status` route surfaces connection state so the panel can inform the user.

---

## Invocation Log

Every task is appended to `data/default-user/user/files/claudefulcrum_log.json` on completion. Records: timestamp, taskId, preset, mode, tools requested, outcome, duration.
