/**
 * @file plugin/presets/index.js
 * @stamp 2026-06-12T00:00:00.000Z
 * @architectural-role Pure — preset task definitions registry
 * @description
 * Loads preset definitions from *.md files in this directory. Each file uses
 * YAML frontmatter for metadata (id, label, mode, order, tools, contextFiles)
 * and a markdown body as the prompt template. Add a new .md file to add a
 * new preset — no code changes required.
 *
 * @api-declaration
 * getPresets()  — returns all preset definitions sorted by order
 * getPreset(id) — returns a single preset by id, or undefined
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname }             from 'node:path';
import { fileURLToPath }             from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) return { meta: {}, body: content.trim() };

    const meta = {};
    let currentKey = null;

    for (const rawLine of match[1].split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        if (/^  - /.test(line) && currentKey) {
            if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
            meta[currentKey].push(line.slice(4).trim());
            continue;
        }
        const kv = line.match(/^([\w-]+):\s*(.*)$/);
        if (kv) {
            const [, key, val] = kv;
            currentKey = key;
            meta[key] = val.trim() !== '' ? val.trim() : [];
        }
    }

    return { meta, body: match[2].trim() };
}

function toArray(v) {
    if (Array.isArray(v)) return v;
    if (v && v !== '') return [v];
    return [];
}

function loadPresets() {
    const files = readdirSync(__dirname)
        .filter(f => f.endsWith('.md'))
        .sort();

    const presets = [];
    for (const file of files) {
        try {
            const content = readFileSync(join(__dirname, file), 'utf8');
            const { meta, body } = parseFrontmatter(content);
            if (!meta.id || !meta.label) {
                console.warn(`[CFM presets] skipping ${file} — missing id or label`);
                continue;
            }
            presets.push({
                id:           meta.id,
                label:        meta.label,
                mode:         meta.mode ?? 'cc',
                order:        meta.order != null ? Number(meta.order) : 999,
                tools:        toArray(meta.tools),
                contextFiles: toArray(meta.contextFiles),
                prompt:       body,
            });
        } catch (e) {
            console.warn(`[CFM presets] failed to load ${file}:`, e.message);
        }
    }

    return presets.sort((a, b) => a.order - b.order);
}

const PRESETS = loadPresets();

export function getPresets() {
    return PRESETS;
}

export function getPreset(id) {
    return PRESETS.find(p => p.id === id);
}
