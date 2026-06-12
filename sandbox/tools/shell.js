/**
 * @file sandbox/tools/shell.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — executes shell commands
 * @description
 * Provides the run_bash tool. Spawns commands in CFM_APP_ROOT (the ST
 * installation root, passed by the plugin when spawning the sandbox).
 * The plugin's tier gate is the security boundary — this module does
 * not restrict commands.
 *
 * @api-declaration
 * getShellTools() — returns array of MCP tool definition objects
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [none]
 *     external_io:      [child_process.exec]
 */

import { exec }      from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const APP_ROOT  = process.env.CFM_APP_ROOT ?? process.cwd();

export function getShellTools() {
    return [
        {
            name:        'run_bash',
            description: 'Run a shell command. CWD defaults to ST app root.',
            inputSchema: {
                type:       'object',
                properties: {
                    command: { type: 'string', description: 'Shell command to run' },
                    cwd:     { type: 'string', description: 'Working directory (relative to ST app root, or absolute)' },
                    timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
                },
                required: ['command'],
            },
            handler: async ({ command, cwd, timeout = 30000 }) => {
                const workdir = cwd
                    ? (cwd.startsWith('/') ? cwd : `${APP_ROOT}/${cwd}`)
                    : APP_ROOT;
                try {
                    const { stdout, stderr } = await execAsync(command, { cwd: workdir, timeout });
                    const parts = [stdout.trim(), stderr.trim()].filter(Boolean);
                    const out   = parts.join('\n--- stderr ---\n') || '(no output)';
                    return { content: [{ type: 'text', text: out }] };
                } catch (err) {
                    const msg = [err.stdout?.trim(), err.stderr?.trim(), err.message]
                        .filter(Boolean).join('\n');
                    return {
                        content: [{ type: 'text', text: `Exit ${err.code ?? '?'}: ${msg}` }],
                        isError: true,
                    };
                }
            },
        },
    ];
}
