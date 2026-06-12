/**
 * @file plugin/cc-binary.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Pure Function — resolves the CC binary path at runtime
 * @description
 * Locates the Claude Code native binary from the host VS Code extension
 * mounted at /host-cc-extensions. Globs for anthropic.claude-code-* directories
 * and returns the binary inside the highest-versioned one.
 *
 * The host mount is added to compose.yaml as:
 *   /config/extensions:/host-cc-extensions:ro
 *
 * @api-declaration
 * resolveCCBinary() — resolves to the binary path, rejects if not found
 *
 * @contract
 *   assertions:
 *     purity:       IO Wrapper (filesystem read only)
 *     state:        [none]
 *     external_io:  [/host-cc-extensions filesystem]
 */

import { readdir, access } from 'node:fs/promises';
import path                from 'node:path';

const HOST_EXT_ROOT = '/host-cc-extensions';
const NATIVE_REL    = path.join('resources', 'native-binary', 'claude');

let _cached = null;

export async function resolveCCBinary() {
    if (_cached) return _cached;

    let entries;
    try {
        entries = await readdir(HOST_EXT_ROOT);
    } catch (err) {
        console.error(`[CFM cc-binary] Cannot read ${HOST_EXT_ROOT}: ${err.message} — container may need recreating (docker compose up -d --force-recreate)`);
        throw new Error(
            `Host CC extension mount not found at ${HOST_EXT_ROOT}. ` +
            `Recreate the container: docker compose up -d --force-recreate sillytavern`
        );
    }

    const dirs = entries
        .filter(e => e.startsWith('anthropic.claude-code'))
        .sort()
        .reverse();

    console.log(`[CFM cc-binary] ${HOST_EXT_ROOT} contains ${entries.length} entries total, ${dirs.length} matching anthropic.claude-code. First 5:`, entries.slice(0, 5));

    for (const dir of dirs) {
        const candidate = path.join(HOST_EXT_ROOT, dir, NATIVE_REL);
        try {
            await access(candidate);
            console.log(`[CFM cc-binary] Using binary: ${candidate}`);
            _cached = candidate;
            return candidate;
        } catch {
            // not present in this dir, try next
        }
    }

    throw new Error(
        `No usable claude binary found under ${HOST_EXT_ROOT}/anthropic.claude-code-*/resources/native-binary/claude. ` +
        `Is the VS Code Claude Code extension installed on the host?`
    );
}
