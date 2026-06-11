/**
 * @file plugin/sse-server.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Stateful + Orchestrator — task registry, SSE streams, HTTP routes
 * @description
 * Owns the active task registry and all HTTP routes for the ClaudeFulcrum
 * plugin. Exposes four endpoints on the ST plugin router:
 *   GET  /stream?taskId   — SSE stream for a running task
 *   POST /run             — start a new task; returns taskId + approval summary
 *   POST /approve         — resume a task after pre-run approval
 *   POST /cancel          — abort a running task
 *
 * Tasks run concurrently. Each task owns an AbortController, its SSE
 * client set, and its runner generator. On process exit or cancelAll(),
 * all subprocesses are terminated.
 *
 * @api-declaration
 * registerRoutes(router) — attaches all routes to the ST Express router
 * cancelAll()            — aborts all active tasks (called on plugin exit)
 *
 * @contract
 *   assertions:
 *     purity:           Stateful + Orchestrator
 *     state_ownership:  [_tasks]
 *     external_io:      [Express routes, SSE responses, runner subprocesses]
 */

import crypto          from 'node:crypto';
import fs             from 'node:fs';
import path           from 'node:path';
import { getRunner }   from './runner-factory.js';

const _DBG          = path.resolve(process.cwd(), 'data/default-user/user/files/cfm_debug.log');
const _SESSION_FILE = path.resolve(process.cwd(), 'data/default-user/user/files/st_session.json');
function _getSession() {
    // Always re-read: Loggeryze writes st_session.json after CFM's module loads,
    // so caching the first read would lock in a stale value for the whole process lifetime.
    try { return JSON.parse(fs.readFileSync(_SESSION_FILE, 'utf8')); } catch {}
    return { session: 'unknown', restart: 0 };
}

function _dbg(obj) {
    const { session, restart } = _getSession();
    try { fs.appendFileSync(_DBG, JSON.stringify({ ts: new Date().toISOString(), session, restart, ...obj }) + '\n'); } catch {}
}
_dbg({ event: 'module_loaded' });
import { getPreset, getPresets } from './presets/index.js';
import { assemble }    from './context-assembler.js';
import { classifyTools, getUnclassified } from './approval/tier-gate.js';
import { logInvocation } from './logger.js';
import { checkBinary }   from './runners/cc.js';

// ─── Task registry ────────────────────────────────────────────────────────────

const _tasks = new Map();
// task shape: { id, preset, mode, tools, abortController, clients: Set, status, startedAt }

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseWrite(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(taskId, event, data) {
    const task = _tasks.get(taskId);
    if (!task) return;
    for (const res of task.clients) {
        try { sseWrite(res, event, data); } catch {}
    }
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerRoutes(router) {

    // ── GET /stream — SSE subscription ───────────────────────────────────────
    router.get('/stream', (req, res) => {
        const { taskId } = req.query;
        _dbg({ event: 'stream_get', taskId, tasksSize: _tasks.size, found: _tasks.has(taskId), knownIds: [..._tasks.keys()] });
        console.log('[CFM] /stream GET — taskId:', taskId, '| tasks in map:', _tasks.size, '| found:', _tasks.has(taskId));
        if (!taskId || !_tasks.has(taskId)) {
            console.log('[CFM] /stream 404 — known taskIds:', [..._tasks.keys()]);
            _dbg({ event: 'stream_404', taskId });
            return res.status(404).json({ error: 'Task not found' });
        }
        res.set({
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection':    'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();

        const task = _tasks.get(taskId);
        task.clients.add(res);

        // Cancel the no-client watchdog now that a client has connected
        if (task._watchdog) {
            clearTimeout(task._watchdog);
            task._watchdog = null;
        }

        // If execution was deferred until first client, start it now
        if (task.status === 'ready-to-run') {
            _dbg({ event: 'execute_start', taskId });
            _execute(taskId);
        }

        req.on('close', () => {
            task.clients.delete(res);
            // If approval was pending and client disconnected — auto-deny
            if (task.status === 'awaiting-approval' && task.clients.size === 0) {
                task.abortController.abort();
            }
        });
    });

    // ── POST /run — start a task ──────────────────────────────────────────────
    router.post('/run', async (req, res) => {
        _dbg({ event: 'run_post', body: req.body });
        console.log('[CFM] POST /run — body:', JSON.stringify(req.body));
        const { presetId, prompt: userPrompt = '', mode = 'cc' } = req.body ?? {};

        const preset = presetId ? getPreset(presetId) : null;
        const tools  = preset?.tools ?? ['Read', 'Glob', 'LS'];

        // Classify tools for pre-run approval summary
        const classified   = classifyTools(tools);
        const needsApproval = classified.some(t => t.tier >= 2);

        const taskId = crypto.randomUUID();
        const abortController = new AbortController();

        const task = {
            id:              taskId,
            preset:          preset?.id ?? 'freeform',
            mode,
            tools,
            userPrompt,
            abortController,
            clients:         new Set(),
            status:          needsApproval ? 'awaiting-approval' : 'ready-to-run',
            startedAt:       Date.now(),
            classified,
            _watchdog:       null,
        };

        // Abort if no SSE client connects within 10 seconds
        task._watchdog = setTimeout(() => {
            if (_tasks.has(taskId) && task.clients.size === 0) {
                task.abortController.abort();
                _tasks.delete(taskId);
            }
        }, 10000);

        _tasks.set(taskId, task);
        _dbg({ event: 'task_created', taskId, status: task.status, tasksSize: _tasks.size });

        const { session, restart } = _getSession();
        res.json({
            taskId,
            needsApproval,
            tools: classified,
            missingContext: [],
            session,
            restart,
        });
    });

    // ── POST /approve — user approved the pre-run tool summary ───────────────
    router.post('/approve', (req, res) => {
        const { taskId, approved } = req.body ?? {};
        const task = _tasks.get(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        if (!approved) {
            task.abortController.abort();
            task.status = 'cancelled';
            broadcast(taskId, 'done', { subtype: 'cancelled' });
            _tasks.delete(taskId);
            return res.json({ ok: true });
        }

        task.status = 'ready-to-run';
        res.json({ ok: true });
    });

    // ── POST /cancel — abort a running task ───────────────────────────────────
    router.post('/cancel', (req, res) => {
        const { taskId } = req.body ?? {};
        const task = _tasks.get(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        task.abortController.abort();
        task.status = 'cancelled';
        broadcast(taskId, 'done', { subtype: 'cancelled' });
        _cleanup(taskId, 'cancelled');
        res.json({ ok: true });
    });

    // ── GET /presets — list available presets ─────────────────────────────────
    router.get('/presets', (_req, res) => {
        res.json(getPresets());
    });

    // ── GET /status — auth + binary status ───────────────────────────────────
    router.get('/status', async (_req, res) => {
        const binaryOk = await checkBinary();
        const unclassified = getUnclassified();
        res.json({ binaryOk, unclassified });
    });
}

// ─── Task execution ───────────────────────────────────────────────────────────

async function _execute(taskId) {
    const task = _tasks.get(taskId);
    if (!task) return;

    task.status = 'running';
    console.log(`[CFM] _execute start — taskId:${taskId} preset:${task.preset} mode:${task.mode} clients:${task.clients.size}`);
    const { prompt, missingContext } = assemble(
        task.preset !== 'freeform' ? getPreset(task.preset) : null,
        task.userPrompt,
    );

    if (missingContext.length > 0) {
        broadcast(taskId, 'warning', {
            message: `Context files not found: ${missingContext.join(', ')}`,
        });
    }

    const runner = getRunner(task.mode);
    let outcome  = 'complete';

    try {
        for await (const event of runner.run({
            prompt,
            allowedTools: task.tools,
            signal:       task.abortController.signal,
        })) {
            if (task.abortController.signal.aborted) break;
            broadcast(taskId, 'event', event);
        }
    } catch (err) {
        outcome = 'error';
        broadcast(taskId, 'error', { message: err.message });
    }

    if (task.abortController.signal.aborted) outcome = 'cancelled';

    broadcast(taskId, 'done', { subtype: outcome });
    _cleanup(taskId, outcome);
}

function _cleanup(taskId, outcome) {
    const task = _tasks.get(taskId);
    if (!task) return;

    logInvocation({
        taskId,
        preset:    task.preset,
        mode:      task.mode,
        tools:     task.tools,
        outcome,
        durationMs: Date.now() - task.startedAt,
    });

    // Close SSE connections
    for (const res of task.clients) {
        try { res.end(); } catch {}
    }
    _tasks.delete(taskId);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function cancelAll() {
    for (const [taskId, task] of _tasks) {
        task.abortController.abort();
        _cleanup(taskId, 'cancelled');
    }
}
