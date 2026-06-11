/**
 * @file plugin/runner-factory.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Pure — selects the appropriate runner for a given mode
 * @description
 * Returns the correct runner module based on the requested mode string.
 * The SSE server and task manager never import runners directly — they
 * always go through this factory so the runner selection is a single,
 * auditable decision point.
 *
 * @api-declaration
 * getRunner(mode) — returns runner module { run } for 'cc' or 'direct'
 *
 * @contract
 *   assertions:
 *     purity:           Pure
 *     state_ownership:  [none]
 *     external_io:      [none]
 */

import * as ccRunner     from './runners/cc.js';
import * as directRunner from './runners/direct.js';

export function getRunner(mode) {
    if (mode === 'direct') return directRunner;
    return ccRunner; // default to CC for any unrecognised mode
}
