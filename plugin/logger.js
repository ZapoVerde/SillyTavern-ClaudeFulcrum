/**
 * @file plugin/logger.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — append-only invocation log writer
 * @description
 * Writes task invocation records to claudefulcrum_log.json in ST's user
 * files directory. Uses a write queue to serialise concurrent task
 * completions safely. Follows the Loggeryze path pattern.
 *
 * @api-declaration
 * logInvocation(record) — queues an invocation record for writing
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [_queue, _writing]
 *     external_io:      [claudefulcrum_log.json]
 */

import path from 'node:path';
import fs   from 'node:fs';

const LOG_FILE = path.resolve(process.cwd(), 'data/default-user/user/files/claudefulcrum_log.json');
const MAX_ENTRIES = 500;

// ─── State ────────────────────────────────────────────────────────────────────

const _queue  = [];
let _writing  = false;

// ─── Queue ────────────────────────────────────────────────────────────────────

export function logInvocation(record) {
    _queue.push({ ...record, ts: Date.now() });
    _drain();
}

async function _drain() {
    if (_writing || _queue.length === 0) return;
    _writing = true;
    const record = _queue.shift();
    try {
        let entries = [];
        try {
            const raw = fs.readFileSync(LOG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) entries = parsed;
        } catch {}
        entries.push(record);
        if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
        fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
    } catch (err) {
        console.error('[CFM] Log write failed:', err.message);
    }
    _writing = false;
    if (_queue.length > 0) _drain();
}
