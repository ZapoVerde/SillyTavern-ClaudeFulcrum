/**
 * @file sandbox/tools/git.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — git operations via CLI
 * @description
 * Provides git_status, git_diff, git_log, git_commit. All commands run
 * with CFM_APP_ROOT as CWD. Read operations (status, diff, log) are
 * inherently tier 1; git_commit modifies state and is tier 2.
 *
 * @api-declaration
 * getGitTools() — returns array of MCP tool definition objects
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [none]
 *     external_io:      [child_process.exec, git CLI]
 */

import { exec }      from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const APP_ROOT  = process.env.CFM_APP_ROOT ?? process.cwd();

async function git(args) {
    try {
        const { stdout, stderr } = await execAsync(`git ${args}`, { cwd: APP_ROOT, timeout: 15000 });
        return { ok: true, out: (stdout || stderr).trim() };
    } catch (err) {
        const msg = [err.stdout?.trim(), err.stderr?.trim(), err.message].filter(Boolean).join('\n');
        return { ok: false, out: msg };
    }
}

export function getGitTools() {
    return [
        {
            name:        'git_status',
            description: 'Show git working tree status in ST app root.',
            inputSchema: { type: 'object', properties: {}, required: [] },
            handler: async () => {
                const r = await git('status');
                return { content: [{ type: 'text', text: r.out || '(nothing)' }], isError: !r.ok };
            },
        },
        {
            name:        'git_diff',
            description: 'Show git diff. Optionally scope to a path or show staged changes.',
            inputSchema: {
                type:       'object',
                properties: {
                    path:   { type: 'string',  description: 'Specific file or directory to diff' },
                    staged: { type: 'boolean', description: 'Show staged changes (default false)' },
                },
                required: [],
            },
            handler: async ({ path: p, staged }) => {
                const parts = ['diff', staged && '--staged', p].filter(Boolean);
                const r = await git(parts.join(' '));
                return { content: [{ type: 'text', text: r.out || '(no diff)' }], isError: !r.ok };
            },
        },
        {
            name:        'git_log',
            description: 'Show recent git commit log.',
            inputSchema: {
                type:       'object',
                properties: {
                    n: { type: 'number', description: 'Number of commits to show (default 10)' },
                },
                required: [],
            },
            handler: async ({ n = 10 }) => {
                const r = await git(`log --oneline -${n}`);
                return { content: [{ type: 'text', text: r.out || '(no commits)' }], isError: !r.ok };
            },
        },
        {
            name:        'git_commit',
            description: 'Stage all changes (git add -A) and commit with the given message.',
            inputSchema: {
                type:       'object',
                properties: {
                    message: { type: 'string', description: 'Commit message' },
                },
                required: ['message'],
            },
            handler: async ({ message }) => {
                const add = await git('add -A');
                if (!add.ok) {
                    return { content: [{ type: 'text', text: `git add failed:\n${add.out}` }], isError: true };
                }
                const commit = await git(`commit -m ${JSON.stringify(message)}`);
                return { content: [{ type: 'text', text: commit.out }], isError: !commit.ok };
            },
        },
    ];
}
