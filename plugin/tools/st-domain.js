/**
 * @file plugin/tools/st-domain.js
 * @stamp 2026-06-12T00:00:00.000Z
 * @architectural-role IO Wrapper — ST-domain MCP tool implementations
 * @description
 * Implements MCP tools for reading and writing ST user data: character cards,
 * lorebooks, and settings. All tools run in the plugin process and have full
 * access to the ST filesystem. write_character and write_lorebook enforce the
 * code zone boundary via tier-gate.isCodeZone. PNG card extraction is handled
 * natively — no external dependencies.
 *
 * @api-declaration
 * getStDomainTools() — returns array of MCP tool definition objects
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

const APP_ROOT    = process.cwd();
const CHARS_DIR   = path.join(APP_ROOT, 'data/default-user/characters');
const WORLDS_DIR  = path.join(APP_ROOT, 'data/default-user/worlds');
const SETTINGS    = path.join(APP_ROOT, 'data/default-user/settings.json');

function ok(text)  { return { content: [{ type: 'text', text: String(text) }] }; }
function err(text) { return { content: [{ type: 'text', text: String(text) }], isError: true }; }
function okJson(obj) { return ok(JSON.stringify(obj, null, 2)); }

// ─── PNG chara chunk extraction ───────────────────────────────────────────────

function extractCharaFromPng(buf) {
    if (buf.length < 8) return null;
    let offset = 8;
    while (offset + 12 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type   = buf.subarray(offset + 4, offset + 8).toString('ascii');
        if (type === 'tEXt' && offset + 8 + length <= buf.length) {
            const payload  = buf.subarray(offset + 8, offset + 8 + length);
            const nullIdx  = payload.indexOf(0);
            if (nullIdx !== -1 && payload.subarray(0, nullIdx).toString('ascii') === 'chara') {
                try {
                    return JSON.parse(Buffer.from(
                        payload.subarray(nullIdx + 1).toString('ascii'), 'base64',
                    ).toString('utf8'));
                } catch { return null; }
            }
        }
        offset += 12 + length;
    }
    return null;
}

// ─── Character tools ──────────────────────────────────────────────────────────

async function listCharacters() {
    try {
        const entries = await fs.readdir(CHARS_DIR, { withFileTypes: true });
        const names   = entries
            .filter(e => e.isFile() && (e.name.endsWith('.png') || e.name.endsWith('.json')))
            .map(e => e.name);
        return okJson(names);
    } catch (e) {
        return err(`list_characters: ${e.message}`);
    }
}

async function readCharacter({ name }) {
    const base = path.join(CHARS_DIR, name);
    for (const ext of ['.json', '.png', '']) {
        const full = ext ? base + ext : base;
        try {
            const buf = await fs.readFile(full);
            if (full.endsWith('.png')) {
                const data = extractCharaFromPng(buf);
                if (!data) return err(`read_character: no chara chunk found in ${name}`);
                return okJson(data);
            }
            return ok(buf.toString('utf8'));
        } catch { continue; }
    }
    return err(`read_character: "${name}" not found`);
}

async function writeCharacter({ name, data }) {
    const filename = name.endsWith('.json') ? name : name + '.json';
    const dest     = path.join(CHARS_DIR, filename);
    if (isCodeZone(dest)) return err('write_character: characters directory is a code zone');
    try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        await fs.mkdir(CHARS_DIR, { recursive: true });
        await fs.writeFile(dest, payload, 'utf8');
        return ok(`Written: ${filename}`);
    } catch (e) {
        return err(`write_character: ${e.message}`);
    }
}

// ─── Lorebook tools ───────────────────────────────────────────────────────────

async function listLorebooks() {
    try {
        const entries = await fs.readdir(WORLDS_DIR, { withFileTypes: true });
        const names   = entries.filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name);
        return okJson(names);
    } catch (e) {
        return err(`list_lorebooks: ${e.message}`);
    }
}

async function readLorebook({ name }) {
    const filename = name.endsWith('.json') ? name : name + '.json';
    try {
        const text = await fs.readFile(path.join(WORLDS_DIR, filename), 'utf8');
        return ok(text);
    } catch (e) {
        return err(`read_lorebook: ${e.message}`);
    }
}

async function writeLorebook({ name, data }) {
    const filename = name.endsWith('.json') ? name : name + '.json';
    const dest     = path.join(WORLDS_DIR, filename);
    if (isCodeZone(dest)) return err('write_lorebook: worlds directory is a code zone');
    try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        await fs.mkdir(WORLDS_DIR, { recursive: true });
        await fs.writeFile(dest, payload, 'utf8');
        return ok(`Written: ${filename}`);
    } catch (e) {
        return err(`write_lorebook: ${e.message}`);
    }
}

async function addLorebookEntry({ lorebook, entry }) {
    const filename = lorebook.endsWith('.json') ? lorebook : lorebook + '.json';
    const dest     = path.join(WORLDS_DIR, filename);
    if (isCodeZone(dest)) return err('add_lorebook_entry: worlds directory is a code zone');
    try {
        let book;
        try {
            book = JSON.parse(await fs.readFile(dest, 'utf8'));
        } catch {
            book = { name: lorebook.replace(/\.json$/, ''), entries: {}, extensions: {} };
        }
        const entries    = book.entries ?? {};
        const nextUid    = Object.keys(entries).length === 0
            ? 0
            : Math.max(...Object.keys(entries).map(Number)) + 1;
        const defaults   = {
            uid: nextUid, key: [], keysecondary: [], comment: '', content: '',
            constant: false, vectorized: false, selective: false, selectiveLogic: 0,
            addMemo: true, order: 100, position: 0, disable: false,
            probability: 100, useProbability: false, depth: 4,
            sticky: 0, cooldown: 0, delay: 0, group: '', groupWeight: 100,
            scanDepth: null, caseSensitive: null, matchWholeWords: null,
            excludeRecursion: false, preventRecursion: false, delayUntilRecursion: false,
            displayIndex: nextUid, characterFilter: null,
        };
        entries[String(nextUid)] = { ...defaults, ...entry, uid: nextUid };
        book.entries = entries;
        await fs.writeFile(dest, JSON.stringify(book, null, 2), 'utf8');
        return ok(`Entry ${nextUid} added to ${filename}`);
    } catch (e) {
        return err(`add_lorebook_entry: ${e.message}`);
    }
}

async function updateLorebookEntry({ lorebook, uid, patch }) {
    const filename = lorebook.endsWith('.json') ? lorebook : lorebook + '.json';
    const dest     = path.join(WORLDS_DIR, filename);
    if (isCodeZone(dest)) return err('update_lorebook_entry: worlds directory is a code zone');
    try {
        const book    = JSON.parse(await fs.readFile(dest, 'utf8'));
        const key     = String(uid);
        if (!book.entries?.[key]) return err(`update_lorebook_entry: uid ${uid} not found`);
        book.entries[key] = { ...book.entries[key], ...patch, uid };
        await fs.writeFile(dest, JSON.stringify(book, null, 2), 'utf8');
        return ok(`Entry ${uid} updated in ${filename}`);
    } catch (e) {
        return err(`update_lorebook_entry: ${e.message}`);
    }
}

// ─── Settings tools ───────────────────────────────────────────────────────────

async function readSettings({ key_path } = {}) {
    try {
        const text     = await fs.readFile(SETTINGS, 'utf8');
        const settings = JSON.parse(text);
        if (!key_path) return okJson(Object.keys(settings));
        const val = key_path.split('.').reduce((o, k) => o?.[k], settings);
        return val === undefined ? err(`read_settings: key "${key_path}" not found`) : okJson(val);
    } catch (e) {
        return err(`read_settings: ${e.message}`);
    }
}

async function patchSettings({ key_path, value }) {
    if (isCodeZone(SETTINGS)) return err('patch_settings: settings is in a code zone');
    try {
        const text     = await fs.readFile(SETTINGS, 'utf8');
        const settings = JSON.parse(text);
        const keys     = key_path.split('.');
        let   target   = settings;
        for (const k of keys.slice(0, -1)) {
            if (typeof target[k] !== 'object' || target[k] === null) target[k] = {};
            target = target[k];
        }
        target[keys.at(-1)] = value;
        await fs.writeFile(SETTINGS, JSON.stringify(settings, null, 2), 'utf8');
        return ok(`Patched settings.${key_path}`);
    } catch (e) {
        return err(`patch_settings: ${e.message}`);
    }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export function getStDomainTools() {
    return [
        {
            name:        'list_characters',
            description: 'List all character files (.png and .json) in the ST characters directory.',
            inputSchema: { type: 'object', properties: {} },
            handler:     listCharacters,
        },
        {
            name:        'read_character',
            description: 'Read a character card by filename (with or without extension). Returns the embedded JSON data.',
            inputSchema: {
                type: 'object',
                properties: { name: { type: 'string', description: 'Filename, e.g. "Anya" or "Anya.png"' } },
                required: ['name'],
            },
            handler: readCharacter,
        },
        {
            name:        'write_character',
            description: 'Create or overwrite a character card as a .json file. Provide the full card data object.',
            inputSchema: {
                type:       'object',
                properties: {
                    name: { type: 'string', description: 'Character name (used as filename)' },
                    data: {
                        type: 'object',
                        description: 'Chara Card V3 object. Must include spec, spec_version, name, description, first_mes, and a data sub-object with the same fields plus creator_notes, system_prompt, post_history_instructions, alternate_greetings, tags, character_book.',
                    },
                },
                required: ['name', 'data'],
            },
            handler: writeCharacter,
        },
        {
            name:        'list_lorebooks',
            description: 'List all lorebook (.json) files in the ST worlds directory.',
            inputSchema: { type: 'object', properties: {} },
            handler:     listLorebooks,
        },
        {
            name:        'read_lorebook',
            description: 'Read a lorebook by filename. Returns the full JSON.',
            inputSchema: {
                type: 'object',
                properties: { name: { type: 'string', description: 'Filename, e.g. "Bastard" or "Bastard.json"' } },
                required: ['name'],
            },
            handler: readLorebook,
        },
        {
            name:        'write_lorebook',
            description: 'Create or overwrite a lorebook. Provide the full lorebook object {name, entries, extensions}.',
            inputSchema: {
                type:       'object',
                properties: {
                    name: { type: 'string' },
                    data: { type: 'object', description: 'Full lorebook object' },
                },
                required: ['name', 'data'],
            },
            handler: writeLorebook,
        },
        {
            name:        'add_lorebook_entry',
            description: 'Add a new entry to an existing lorebook. Creates the lorebook if it does not exist. Returns the assigned uid.',
            inputSchema: {
                type:       'object',
                properties: {
                    lorebook: { type: 'string', description: 'Lorebook filename' },
                    entry:    {
                        type: 'object',
                        description: 'Entry fields: key (string[]), content (string), comment (string), constant (bool), selective (bool), order (number), position (0-4), disable (bool). All optional — defaults are applied for omitted fields.',
                    },
                },
                required: ['lorebook', 'entry'],
            },
            handler: addLorebookEntry,
        },
        {
            name:        'update_lorebook_entry',
            description: 'Patch fields on an existing lorebook entry by uid.',
            inputSchema: {
                type:       'object',
                properties: {
                    lorebook: { type: 'string' },
                    uid:      { type: 'number', description: 'Entry uid to update' },
                    patch:    { type: 'object', description: 'Fields to update' },
                },
                required: ['lorebook', 'uid', 'patch'],
            },
            handler: updateLorebookEntry,
        },
        {
            name:        'read_settings',
            description: 'Read ST settings. Without key_path returns the top-level key list. With key_path (dot-separated) returns that value.',
            inputSchema: {
                type:       'object',
                properties: {
                    key_path: { type: 'string', description: 'Dot-separated path, e.g. "power_user.lazy_load_legacy_chat"' },
                },
            },
            handler: readSettings,
        },
        {
            name:        'patch_settings',
            description: 'Set a single key in settings.json. key_path is dot-separated. Value replaces the existing value at that path.',
            inputSchema: {
                type:       'object',
                properties: {
                    key_path: { type: 'string' },
                    value:    { description: 'New value (any JSON type)' },
                },
                required: ['key_path', 'value'],
            },
            handler: patchSettings,
        },
    ];
}
