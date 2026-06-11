/**
 * @file plugin/context-assembler.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Pure — composes the full prompt from preset + context files
 * @description
 * Reads the workspace map (CLAUDE.md) and any context files declared by the
 * preset, then assembles the final prompt string that gets passed to the
 * runner. Context files live in the extension root's context/ directory.
 * Missing context files are reported as warnings, not errors — the task
 * runs with whatever context is available.
 *
 * @api-declaration
 * assemble(preset, userPrompt) — returns { prompt, missingContext[] }
 *
 * @contract
 *   assertions:
 *     purity:           Pure (reads files; no writes, no network)
 *     state_ownership:  [none]
 *     external_io:      [CLAUDE.md, context/*.md files]
 */

import path             from 'node:path';
import fs               from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.resolve(__dirname, '..');
const CONTEXT_DIR    = path.join(EXTENSION_ROOT, 'context');
const CLAUDE_MD      = path.join(EXTENSION_ROOT, 'CLAUDE.md');

function readOptional(filePath) {
    try { return fs.readFileSync(filePath, 'utf8'); }
    catch { return null; }
}

export function assemble(preset, userPrompt = '') {
    const missing = [];
    const parts   = [];

    // Workspace map — always prepended
    const claudeMd = readOptional(CLAUDE_MD);
    if (claudeMd) {
        parts.push(`# Workspace Map\n\n${claudeMd}`);
    }

    // Selective context files declared by the preset
    for (const filename of (preset?.contextFiles ?? [])) {
        const filePath = path.join(CONTEXT_DIR, filename);
        const content  = readOptional(filePath);
        if (content) {
            parts.push(`# Context: ${filename}\n\n${content}`);
        } else {
            missing.push(filename);
            console.warn(`[CFM] Context file not found: ${filename}`);
        }
    }

    // Task prompt — preset template or user freeform
    const taskPrompt = userPrompt.trim() || preset?.prompt || '';
    if (taskPrompt) parts.push(`# Task\n\n${taskPrompt}`);

    return {
        prompt:         parts.join('\n\n---\n\n'),
        missingContext: missing,
    };
}
