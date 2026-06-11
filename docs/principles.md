# ClaudeFulcrum — Project Principles
*Read before writing any code. Applies to every session.*

---

## What a Principle Is

**A principle is an enduring statement of design intent.** It says what must be true and why it matters — not how it is currently implemented. A principle should survive a complete rewrite: if you could achieve the same property by different means, the principle still holds.

**A principle is not:** a description of specific functions or file paths, a code recipe, a static analysis rule, or implementation documentation. When a principle references code by name, that code illustrates the principle in action — it is not the principle itself.

If you find yourself writing "call X" or "wrap in Y", move that detail into code comments or documentation. The principle captures the *why*.

---

## 1. The Companion Server is the Trust Boundary

The browser extension is untrusted. It displays output and captures input — nothing more.

All execution happens on the companion server. The server decides which tools are available, which runner handles the request, and what scope CC is allowed to operate within. The extension never has direct access to the filesystem, never spawns processes, and never holds API credentials.

This boundary is non-negotiable. Code that moves execution logic into the browser extension has broken this principle, regardless of how convenient it seems.

---

## 2. CC is the Primary Mode

Claude Code is not a nice-to-have — it is the reason this tool exists. The full CC runner (filesystem access, bash, tool use, CLAUDE.md awareness) is the design center. Everything else is additive.

The direct API mode exists as a practical alternative for lightweight tasks or when CC usage is exhausted. It is a peer runner with the same interface, not a degraded fallback. But design decisions are made around CC capabilities first. Do not constrain CC to what the direct runner can also do.

---

## 3. Runners Share One Interface

The companion server exposes a single execution interface. Every runner — CC, direct API, or any future addition — implements it identically: receive a prompt and task metadata, yield a stream of events, signal completion or error.

The WebSocket handler does not know which runner it is using. The panel does not know which runner it is using. The only code that knows is the router that selects the runner based on the request's `mode` field.

This is the seam that makes the hybrid model work. Protect it.

---

## 4. Streaming is the Contract

Output is never buffered and displayed. Results stream from the moment the runner produces them.

This is not a UX preference — it is what makes long-running CC tasks usable. A hookseeker audit or plugin health check may take 30 seconds. The user must see progress in real time or the tool feels broken. Any code path that awaits a complete response before updating the panel has broken this principle.

---

## 5. Approvals are Surfaced, Not Suppressed

Tool permissions operate in tiers based on risk. Read-only operations are approved by default — they carry no risk and prompting for them is noise. Operations that modify state surface as a readable approval prompt before execution proceeds. Destructive operations always prompt and cannot be pre-approved for a session.

Unknown tools are never silently approved. When CC uses a tool with no assigned tier, it defaults to the safest applicable tier and the user is informed.

The current session's permission state is always visible. A user must be able to see at a glance what ClaudeFulcrum has been allowed to do.

---

## 6. Preset Tasks Encode Domain Knowledge

The power of ClaudeFulcrum is not in the text input box. It is in the preset task buttons.

A preset task is more than a saved prompt. It encodes which runner to use, which tools to pre-authorize, what context to inject (CLAUDE.md paths, relevant directories), and how to format the output for the panel. Writing a good preset is a design act. The freeform input is for one-off commands; the presets are the product.

When adding a new capability, the question is not "can the user type a prompt for this?" — it is "does this warrant a preset that makes it repeatable and reliable?"

---

## 7. The Panel is Display-Only

The ST extension contains no business logic. It renders output, captures input, and communicates with the companion server over WebSocket. That is its entire responsibility.

State lives on the server. Execution lives on the server. The panel is a terminal window with better CSS.

This boundary keeps the extension simple and the server testable. Code that implements logic in the extension because "it's easier" has deferred a maintenance problem.

---

## 8. The Four Kinds of Code

Every module belongs to exactly one of four categories. Mixing them is a defect.

1. **Pure Functions** — Input in, derived output out. No external reads or writes. No DOM. No network. No knowledge that a server exists.
2. **Stateful Owners** — The strictly bounded gatekeepers of runtime memory. Only one module may own any given state variable.
3. **IO Wrappers** — Spawn processes, call APIs, write files, send WebSocket messages. Contain zero logic. They move data; they do not reason about it.
4. **Orchestrators** — Sequence calls to the other three layers. Decide what runs and in what order; never what the content means. Own no state. Perform no direct IO. Contain no derivation logic.

Each file declares its category before its implementation. That declaration is the first thing a reviewer checks.

---

## 9. Every Module is Self-Describing

Every source file opens with a structured preamble declaring:

- Its architectural role (Pure / Stateful / IO / Orchestrator, and what it owns or does)
- Its public API surface (what it exports and what those exports do)
- Its contracts (what it reads, what it writes, what it must never do)
- A timestamp marking the last intentional architectural change

Write the preamble first. A module whose role cannot be stated clearly in a preamble has not been designed clearly enough to be implemented.

```javascript
/**
 * @file {path}
 * @stamp {utc timestamp}
 * @architectural-role {Pure | Stateful | IO | Orchestrator} — {one line}
 * @description
 * {Two to four sentences. What problem does this module solve? What is it not responsible for?}
 *
 * @api-declaration
 * functionName(args) — what it does and what it returns
 *
 * @contract
 *   assertions:
 *     purity:           {classification}
 *     state_ownership:  [{domains owned, or none}]
 *     external_io:      [{services touched, or none}]
 */
```

---

## 10. Every File Has One Purpose and a Size Budget

Every source file does exactly one thing. If a file is doing two things, it should be two files.

When you reach 300 lines, split the file along the nearest fault line and continue. The preamble already tells you what the file owns — the fault lines follow from that.

---

## 11. CC Runs in a Mapped Workspace

Claude Code is powerful but blind. Without a map of the installation it is operating on, it must guess at paths, conventions, and structure — and it will guess wrong.

Before any task runs, CC receives three declared context artifacts: a workspace map describing where things live in this ST installation, a tool declaration scoping what CC is permitted to do for this task, and the task definition itself. Together these make ClaudeFulcrum reliable rather than exploratory. A task that runs without them is a one-shot experiment. A task that runs with them is a repeatable operation.

These artifacts are first-class. They are user-maintained, they travel with the repo, and they are the primary mechanism for encoding domain knowledge about the ST stack.

---

## 13. One Repo, One Symlink

The ClaudeFulcrum repository contains everything: the ST extension and the ST plugin. There is no separate plugin repo, no separate deploy step, and no two copies of the code to keep in sync.

The ST plugin directory (`st-plugins/claudefulcrum`) is a symlink pointing into the `plugin/` subdirectory of this repo. Editing the plugin code edits it in place. The symlink is created once during installation and never needs to change unless the repo moves.

This means the repo is the single source of truth for both halves of the system. A git pull updates both. A code review covers both. There is no "did you remember to update the plugin?" question.

---

## 14. Code Zones are Read-Only. Data Zones are Yours.

ClaudeFulcrum operates across two permanent categories of path.

**Code zones** — ST core code, extension code, and plugin code — are permanently read-only. No write, modify, or delete operation is permitted against these paths, regardless of tier approval or user instruction. This is a hard enforcement at the plugin level, not a guideline. The rationale: if CC can modify ST or extension code, it can break the system in ways that are difficult to diagnose and may require reinstallation to recover. No task is worth that risk.

**Data zones** — character cards, chat files, lorebooks, images, settings, presets, themes, and anything else the user created or configured — are fully accessible subject to the normal tier approval flow. This is the domain ClaudeFulcrum is designed to work in.

The workspace map declares both zones explicitly so CC knows before planning what it can and cannot do. The plugin enforces the code zone boundary independently, so even a misconfigured workspace map cannot open a code zone to writes.

---

## 15. Tool Tiers are Explicit, User-Owned, and Never Silent

Tier assignments are user-owned configuration, not hardcoded logic. The user can inspect and reassign any tool at any time.

When CC uses a tool with no tier assignment, it is never silently approved or silently blocked. It defaults to approval-required, and the user is surfaced the unclassified tool for permanent assignment. This is the mechanism that keeps ClaudeFulcrum safe across CC updates — new tools are flagged, assigned by the user, and the system moves on without a ClaudeFulcrum release.

---

## 15. Documentation is Part of the Feature

A feature that exists but is not documented is half-shipped.

Every user-facing addition must land in the docs at the same time it lands in the code. If you cannot describe the feature clearly in the documentation, the design is not yet clear enough to be finished.

The documents to maintain:

- **`README.md`** — feature overview, setup, and docs index
- **`principles.md`** — this document
- **`architecture.md`** — structural decisions that future code must remain consistent with
- **`runners.md`** — the runner interface, CC runner configuration, direct runner configuration
- **`presets.md`** — preset task format, how to add new presets, existing presets reference
- **`installation.md`** — prerequisites, companion server setup, ST extension installation
- **`settings.md`** — every user-facing setting, what it does, its default

When you add a runner, update `runners.md`. When you add a preset, update `presets.md`. When you make a structural decision that will constrain future work, update `architecture.md`.
