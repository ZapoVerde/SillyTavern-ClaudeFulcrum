/**
 * @file plugin/approval/tier-gate.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Pure + Stateful — zone resolution and tool tier classification
 * @description
 * Resolves code/data zones from process.cwd() and classifies CC tool names
 * into permission tiers. Used by the context assembler (to inject zone
 * guidance into prompts) and by the SSE server (to build pre-run approval
 * summaries for the panel).
 *
 * @api-declaration
 * resolveZones()            — resolves and caches absolute zone paths; call once on init
 * getZones()                — returns resolved zones object
 * isCodeZone(absPath)       — true if path falls under a read-only code zone
 * classifyTool(name)        — returns tier number (1, 2, or 3) for a tool name
 * classifyTools(names[])    — returns [{name, tier}] for an array of tool names
 * getUnclassified()         — returns tool names seen but not in any tier list
 * recordSeen(name)          — records a tool name encountered during a task
 *
 * @contract
 *   assertions:
 *     purity:           Stateful (owns _zones, _tiers, _unclassified)
 *     state_ownership:  [_zones, _tiers, _unclassified]
 *     external_io:      [reads tool-tiers.json on first call]
 */

import path, { dirname, join } from 'node:path';
import fs, { readFileSync }    from 'node:fs';
import { fileURLToPath }       from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── State ────────────────────────────────────────────────────────────────────

let _zones        = null;
let _tiers        = null;
const _unclassified = new Set();

// ─── Zones ────────────────────────────────────────────────────────────────────

export function resolveZones() {
    const cwd = process.cwd();
    const candidate = (rel) => {
        const abs = path.resolve(cwd, rel);
        return fs.existsSync(abs) ? abs : null;
    };

    _zones = {
        code: [
            candidate('public/scripts/extensions/third-party'),
            candidate('plugins'),
            candidate('src'),
        ].filter(Boolean),
        data: path.resolve(cwd, 'data'),
    };

    return _zones;
}

export function getZones() {
    return _zones ?? resolveZones();
}

export function isCodeZone(absPath) {
    const zones = getZones();
    const resolved = path.resolve(absPath);
    return zones.code.some(z => resolved === z || resolved.startsWith(z + path.sep));
}

// ─── Tiers ────────────────────────────────────────────────────────────────────

function loadTiers() {
    if (_tiers) return _tiers;
    try {
        const raw = readFileSync(join(__dirname, 'tool-tiers.json'), 'utf8');
        _tiers = JSON.parse(raw);
    } catch {
        _tiers = { tier1: [], tier2: [], tier3: [], unknown_default: 'tier2' };
    }
    return _tiers;
}

export function classifyTool(name) {
    const t = loadTiers();
    if (t.tier1.includes(name)) return 1;
    if (t.tier2.includes(name)) return 2;
    if (t.tier3.includes(name)) return 3;
    _unclassified.add(name);
    return parseInt(t.unknown_default.replace('tier', ''), 10) || 2;
}

export function classifyTools(names) {
    return names.map(name => ({ name, tier: classifyTool(name) }));
}

export function getUnclassified() {
    return [..._unclassified];
}

export function recordSeen(name) {
    const t = loadTiers();
    const known = [...t.tier1, ...t.tier2, ...t.tier3];
    if (!known.includes(name)) _unclassified.add(name);
}
