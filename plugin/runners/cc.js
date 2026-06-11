/**
 * @file plugin/runners/cc.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — spawns the claude CLI and streams events
 * @description
 * Spawns `claude -p` with --output-format stream-json and yields parsed
 * stream-json events as an async generator. The CC binary is resolved
 * relative to __dirname so it works from the local npm install inside
 * the plugin directory. Operates from ST's app root (process.cwd()) so
 * CC can navigate the full installation tree.
 *
 * @api-declaration
 * checkBinary()            — resolves true if the claude binary exists
 * run(opts)                — async generator; yields stream-json event objects
 *   opts.prompt            — assembled prompt string
 *   opts.allowedTools      — string[] of pre-authorized tool names
 *   opts.signal            — AbortSignal to cancel the task
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [none]
 *     external_io:      [claude CLI subprocess, stdout/stderr]
 */

import { spawn }         from 'node:child_process';
import path              from 'node:path';
import { access }        from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CC_BINARY  = path.join(__dirname, '..', 'node_modules', '.bin', 'claude');

// ─── Binary check ─────────────────────────────────────────────────────────────

export async function checkBinary() {
    try { await access(CC_BINARY); return true; }
    catch { return false; }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function* run({ prompt, allowedTools = [], signal }) {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    if (allowedTools.length > 0) {
        args.push('--allowedTools', allowedTools.join(','));
    }

    console.log('[CFM runner] cwd:', process.cwd(), '| binary:', CC_BINARY);
    console.log('[CFM runner] args:', args.join(' '));
    try {
        const { readdirSync } = await import('node:fs');
        console.log('[CFM runner] cwd contents:', readdirSync(process.cwd()).join(', '));
    } catch (e) {
        console.log('[CFM runner] cwd read failed:', e.message);
    }

    const proc = spawn(CC_BINARY, args, {
        cwd:   process.cwd(),
        env:   { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (signal) {
        signal.addEventListener('abort', () => {
            try { proc.kill('SIGTERM'); } catch {}
        }, { once: true });
    }

    let buffer   = '';
    let exitCode = null;
    let stderrBuf = '';

    proc.on('exit', (code) => { exitCode = code; });
    proc.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });

    for await (const chunk of proc.stdout) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                yield JSON.parse(trimmed);
            } catch {
                // non-JSON diagnostic line — forward as a debug event
                yield { type: 'debug', text: trimmed };
            }
        }
    }

    if (buffer.trim()) {
        try { yield JSON.parse(buffer.trim()); }
        catch { yield { type: 'debug', text: buffer.trim() }; }
    }

    console.log('[CFM runner] exit code:', exitCode, '| stderr:', stderrBuf.trim().slice(0, 200));
    if (exitCode !== 0 && exitCode !== null && !signal?.aborted) {
        yield {
            type:    'error',
            message: `CC exited with code ${exitCode}${stderrBuf.trim() ? ': ' + stderrBuf.trim().slice(0, 200) : ''}`,
        };
    }
}
