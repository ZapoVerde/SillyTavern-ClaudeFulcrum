/**
 * @file plugin/index.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Orchestrator — ST plugin entry; registers lifecycle and routes
 * @description
 * Entry point for the ClaudeFulcrum ST plugin. Exports the info/init/exit
 * contract required by SillyTavern's plugin loader. Delegates route
 * registration to sse-server, binary detection to cc runner, zone
 * resolution to tier-gate.
 *
 * @api-declaration
 * info       — plugin metadata
 * init(router) — resolves zones, checks CC binary, registers routes
 * exit()     — cancels all active tasks and flushes the log
 *
 * @contract
 *   assertions:
 *     purity:           Orchestrator
 *     state_ownership:  [none]
 *     external_io:      [Express router registration]
 */

import { ensureDeps }                from './installer.js';
import { registerRoutes, cancelAll } from './sse-server.js';
import { checkBinary }               from './runners/cc.js';
import { resolveZones }              from './approval/tier-gate.js';
import { initSandbox, shutdownSandbox, getSandboxStatus } from './sandbox-manager.js';
import { startMcpServer, shutdownMcpServer }             from './mcp-server.js';

export const info = {
    id:          'claudefulcrum',
    name:        'ClaudeFulcrum',
    description: 'Claude Code task runner for SillyTavern',
};

export async function init(router) {
    console.log('[CFM] Initializing...');

    await ensureDeps();
    resolveZones();

    const binaryOk = await checkBinary();
    if (!binaryOk) {
        console.warn('[CFM] cc-runner not reachable — is the cc-runner container running?');
    } else {
        console.log('[CFM] cc-runner reachable.');
    }

    await initSandbox();
    const sb = getSandboxStatus();
    console.log(`[CFM] Sandbox: ${sb.connected ? `connected (${sb.mode}), ${sb.toolCount} tools` : 'not connected'}`);

    await startMcpServer();

    registerRoutes(router);
    console.log('[CFM] Routes registered. Ready.');
}

export async function exit() {
    cancelAll();
    await shutdownSandbox();
    await shutdownMcpServer();
    console.log('[CFM] Exited.');
}
