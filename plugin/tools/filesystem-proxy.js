/**
 * @file plugin/tools/filesystem-proxy.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — filesystem tools running in the plugin process
 * @description
 * Implements read_file, write_file, list_directory, and search_files as
 * plugin-side tools. These cannot live in the sandbox because the sandbox
 * container has no access to ST's filesystem; the plugin process does.
 * write_file enforces the code zone boundary via tier-gate.isCodeZone.
 * All paths are resolved relative to ST app root (process.cwd()).
 *
 * @api-declaration
 * PROXY_TOOL_NAMES     — Set of tool names handled by this module
 * getProxyToolDefs()   — returns tool definition objects (name, description, inputSchema)
 * callProxyTool(name, args) — executes a proxy tool; returns MCP-shaped result
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [none]
 *     external_io:      [node:fs (ST filesystem)]
 */

import path from 'node:path';
import fs   from 'node:fs/promises';
import { isCodeZone } from '../approval/tier-gate.js';

const APP_ROOT = process.cwd();

function resolve(p) {
    return path.isAbsolute(p) ? p : path.resolve(APP_ROOT, p);
}

function ok(text)  { return { content: [{ type: 'text', text }] }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ─── Tool implementations ─────────────────────────────────────────────────────

async function readFile({ path: p }) {
    const abs = resolve(p);
    try {
        const text = await fs.readFile(abs, 'utf8');
        return ok(text);
    } catch (e) {
        return err(`read_file error: ${e.message}`);
    }
}

async function writeFile({ path: p, content }) {
    const abs = resolve(p);
    if (isCodeZone(abs)) return err(`Write refused: ${p} is in a read-only code zone.`);
    try {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, content, 'utf8');
        return ok(`Written: ${p}`);
    } catch (e) {
        return err(`write_file error: ${e.message}`);
    }
}

async function listDirectory({ path: p }) {
    const abs = resolve(p);
    try {
        const entries = await fs.readdir(abs, { withFileTypes: true });
        const lines   = entries.map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`);
        return ok(lines.join('\n') || '(empty)');
    } catch (e) {
        return err(`list_directory error: ${e.message}`);
    }
}

async function searchFiles({ path: p, pattern, glob: globFilter }) {
    const abs = resolve(p);

    async function collect(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        const files   = [];
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) files.push(...await collect(full));
            else files.push(full);
        }
        return files;
    }

    try {
        let files = await collect(abs);

        if (globFilter) {
            // Convert simple glob (*.json, *.md) to a regex on the basename
            const rx = new RegExp(
                '^' + globFilter.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
            );
            files = files.filter(f => rx.test(path.basename(f)));
        }

        const matches = [];
        for (const f of files) {
            if (matches.length >= 200) break;
            let text;
            try { text = await fs.readFile(f, 'utf8'); } catch { continue; }
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(pattern)) {
                    matches.push(`${path.relative(abs, f)}:${i + 1}: ${lines[i].trim()}`);
                    if (matches.length >= 200) break;
                }
            }
        }

        return ok(matches.join('\n') || '(no matches)');
    } catch (e) {
        return err(`search_files error: ${e.message}`);
    }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const _tools = {
    read_file: {
        name:        'read_file',
        description: 'Read a file from the ST installation. Path relative to ST app root.',
        inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required:   ['path'],
        },
        handler: readFile,
    },
    write_file: {
        name:        'write_file',
        description: 'Write content to a file in the ST data zone. Code zones are always rejected.',
        inputSchema: {
            type:       'object',
            properties: {
                path:    { type: 'string' },
                content: { type: 'string' },
            },
            required: ['path', 'content'],
        },
        handler: writeFile,
    },
    list_directory: {
        name:        'list_directory',
        description: 'List directory contents. Path relative to ST app root.',
        inputSchema: {
            type:       'object',
            properties: { path: { type: 'string' } },
            required:   ['path'],
        },
        handler: listDirectory,
    },
    search_files: {
        name:        'search_files',
        description: 'Search for a text pattern across files under a directory (grep -r equivalent).',
        inputSchema: {
            type:       'object',
            properties: {
                path:    { type: 'string', description: 'Directory to search (relative to ST app root)' },
                pattern: { type: 'string', description: 'Text pattern to search for' },
                glob:    { type: 'string', description: 'Filename glob filter, e.g. "*.json"' },
            },
            required: ['path', 'pattern'],
        },
        handler: searchFiles,
    },
};

export const PROXY_TOOL_NAMES = new Set(Object.keys(_tools));

export function getProxyToolDefs() {
    return Object.values(_tools).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export async function callProxyTool(name, args) {
    return _tools[name].handler(args);
}
