/**
 * @file plugin/presets/index.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Pure — preset task definitions registry
 * @description
 * Defines the built-in preset tasks. Each preset declares its label,
 * the tools CC is permitted to use, any context files to inject, and
 * the prompt template. This is the primary mechanism for encoding domain
 * knowledge about ST operations into repeatable, trusted tasks.
 *
 * @api-declaration
 * getPresets()          — returns all preset definitions
 * getPreset(id)         — returns a single preset by id, or undefined
 *
 * @contract
 *   assertions:
 *     purity:           Pure
 *     state_ownership:  [none]
 *     external_io:      [none]
 */

const PRESETS = [
    {
        id:           'hookseeker-audit',
        label:        'Hookseeker Audit',
        mode:         'cc',
        tools:        ['Read', 'Glob', 'Grep', 'LS'],
        contextFiles: ['cnz-layout.md'],
        prompt:       `Perform a hookseeker audit of the Canonize extension.
Check the following:
1. Confirm the hookseeker output fields are present in recent chat messages
2. Confirm anchor data is correctly embedded in the expected metadata fields
3. Check for any missing or malformed chunk headers in lorebook entries
4. Report any anomalies clearly with file paths and line references

Use the workspace map and CNZ layout context to locate the relevant files.
Be thorough but concise in your findings.`,
    },
    {
        id:           'plugin-health',
        label:        'Plugin Health Check',
        mode:         'cc',
        tools:        ['Read', 'Glob', 'LS'],
        contextFiles: ['st-layout.md', 'plugins-layout.md'],
        prompt:       `Perform a health check on the SillyTavern plugin installation.
Check the following:
1. Confirm all plugins in the plugins directory have valid index.js files
2. Confirm plugin symlinks in st-plugins resolve correctly
3. Check that each plugin exports the required info/init/exit interface
4. Note any plugins that appear broken, missing dependencies, or misconfigured

Report findings with specific file paths.`,
    },
    {
        id:           'extension-inventory',
        label:        'Extension Inventory',
        mode:         'cc',
        tools:        ['Read', 'Glob', 'LS'],
        contextFiles: ['extensions-layout.md'],
        prompt:       `List all installed SillyTavern extensions and their status.
For each extension:
1. Name and version from manifest.json
2. Whether it has a server-side plugin component
3. Any obvious issues (missing files, broken manifest)

Format as a clean inventory table.`,
    },
    {
        id:           'freeform',
        label:        'Freeform',
        mode:         'cc',
        tools:        ['Read', 'Glob', 'Grep', 'LS'],
        contextFiles: ['st-layout.md'],
        prompt:       '', // filled by user input
    },
];

export function getPresets() {
    return PRESETS;
}

export function getPreset(id) {
    return PRESETS.find(p => p.id === id);
}
