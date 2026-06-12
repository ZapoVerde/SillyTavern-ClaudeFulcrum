/**
 * @file plugin/runners/cc.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — streams CC tasks via cc-runner HTTP API
 * @description
 * Calls the cc-runner sidecar to run `claude -p` and streams the ndjson
 * response back as parsed event objects. Cancellation kills the remote
 * process via POST /cancel/:taskId.
 *
 * @api-declaration
 * checkBinary()  — resolves true if cc-runner is reachable
 * run(opts)      — async generator; yields stream-json event objects
 */

import crypto            from 'node:crypto';
import { CC_RUNNER_URL } from '../cc-runner-url.js';

export async function checkBinary() {
    try {
        const res = await fetch(`${CC_RUNNER_URL}/auth/status`, {
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function* run({ prompt, allowedTools = [], signal }) {
    const taskId = crypto.randomUUID();

    let res;
    try {
        res = await fetch(`${CC_RUNNER_URL}/run`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ taskId, prompt, allowedTools }),
            signal,
        });
    } catch (err) {
        yield { type: 'error', message: `cc-runner unreachable: ${err.message}` };
        return;
    }

    if (!res.ok) {
        yield { type: 'error', message: `cc-runner returned ${res.status}` };
        return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try { yield JSON.parse(trimmed); }
                catch { yield { type: 'debug', text: trimmed }; }
            }
        }
        if (buffer.trim()) {
            try { yield JSON.parse(buffer.trim()); }
            catch { yield { type: 'debug', text: buffer.trim() }; }
        }
    } finally {
        reader.releaseLock();
        if (signal?.aborted) {
            fetch(`${CC_RUNNER_URL}/cancel/${taskId}`, { method: 'POST' }).catch(() => {});
        }
    }
}
