# CFM Troubleshooting Guide

## Quick reference

| Symptom | Check first |
|---|---|
| "CSRF error — please refresh" | Hard-refresh after restart |
| "Server error 4xx/5xx" | Check `st_server.log` for the startup banner |
| SSE drops immediately | Check `cfm_debug.log` for the event chain |
| Changes not taking effect | Compare `session` in `/run` response vs Loggeryze banner |

---

## 1. Verifying a server restart took effect

Loggeryze writes a startup banner to `st_server.log` during its own `init()` — after its console patches are applied, so the line is always captured:

```
[LOGGERYZE] ===== Server session #N | 2026-06-11T06:21:00.000Z | session: a3f1b9c2 =====
```

**`#N`** — persistent counter stored in `data/default-user/user/files/st_restarts.json`. Increments each time the Node.js process loads the Loggeryze module. If the number does not change after a restart, the module is cached and no code changes have taken effect.

**`session`** — random hex regenerated every time Node.js imports the module fresh. Same value across restarts = module cache; new value = fresh load.

`data/default-user/user/files/st_session.json` always holds the current session:
```json
{ "session": "a3f1b9c2", "restart": 3, "startedAt": "2026-06-11T06:21:00.000Z" }
```

### Workflow for code changes requiring a server restart

1. Note the current `#N` from the last banner in `st_server.log`.
2. Apply the code change.
3. Restart: `docker compose restart sillytavern` (from the stack directory).
4. Tail `st_server.log` and confirm `Server session #(N+1)` appears with a new `session` hex.
5. Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) to clear the stale CSRF token.

---

## 2. Verifying the browser is using fresh server code

The `/run` response always includes `session` and `restart`:

```
[CFM] /run response: {"taskId":"...","session":"a3f1b9c2","restart":3,...}
```

The `session` hex **must match** the one in the latest Loggeryze startup banner. A mismatch means:

- **Server stale**: restart did not trigger or failed — check the banner again.
- **Browser stale**: browser is serving a cached copy of `index.js` — hard-refresh.

---

## 3. CSRF 403 errors

**Symptom:** CFM shows "CSRF error — please refresh the page", or `st_server.log` shows `ForbiddenError: Invalid CSRF token`.

**Cause:** The CSRF token in the browser session was invalidated by a container restart. ST fetches the token once at page load — it goes stale when the server restarts with a new session.

**Fix:** Hard-refresh after every restart. This is not a CFM bug — ST itself behaves identically for all its own API calls.

---

## 4. SSE connection failures (readyState: 2)

**Symptom:** CFM shows "Connection error (readyState 2)" immediately after starting a task.

`cfm_debug.log` (`data/default-user/user/files/cfm_debug.log`) records every key server-side event. Each line carries the `session` and `restart` from `st_session.json`, so you can confirm entries are from the current server run.

Expected sequence:

```jsonc
{"ts":"...","session":"a3f1b9c2","restart":3,"event":"module_loaded"}
{"ts":"...","session":"a3f1b9c2","restart":3,"event":"run_post","body":{...}}
{"ts":"...","session":"a3f1b9c2","restart":3,"event":"task_created","taskId":"...","status":"ready-to-run"}
{"ts":"...","session":"a3f1b9c2","restart":3,"event":"stream_get","taskId":"...","found":true}
{"ts":"...","session":"a3f1b9c2","restart":3,"event":"execute_start","taskId":"..."}
```

**Note:** `module_loaded` is written before Loggeryze's `init()` runs, so its `session` field will show `"unknown"` — this is expected and harmless.

**Diagnosis by what's missing:**

| Last event present | What it means |
|---|---|
| `task_created` but no `stream_get` | The GET `/stream` request never reached the plugin — check for middleware interception or proxy buffering |
| `stream_get` with `found: false` | Task was deleted before the stream connected — watchdog fired too soon or the taskId was wrong |
| `stream_get` with `found: true` but no `execute_start` | Task status was not `ready-to-run` — check `status` field, may be `awaiting-approval` |
| `execute_start` present | Execution started — check runner output in `st_server.log` |

**Also check:** the `session` in `cfm_debug.log` matches `st_session.json`. If it does not, the debug entries are from a previous server run and the current session produced no entries.
