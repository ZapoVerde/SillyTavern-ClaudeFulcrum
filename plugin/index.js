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

import { registerRoutes, cancelAll } from './sse-server.js';
import { checkBinary }               from './runners/cc.js';
import { resolveZones }              from './approval/tier-gate.js';

export const info = {
    id:          'claudefulcrum',
    name:        'ClaudeFulcrum',
    description: 'Claude Code task runner for SillyTavern',
};

export async function init(router) {
    console.log('[CFM] Initializing...');

    resolveZones();

    const binaryOk = await checkBinary();
    if (!binaryOk) {
        console.warn('[CFM] claude binary not found — install via: cd plugin && npm install');
    } else {
        console.log('[CFM] claude binary ready.');
    }

    registerRoutes(router);
    console.log('[CFM] Routes registered. Ready.');
}

export async function exit() {
    cancelAll();
    console.log('[CFM] Exited.');
}
