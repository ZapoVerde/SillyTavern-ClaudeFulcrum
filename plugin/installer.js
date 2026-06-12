/**
 * @file plugin/installer.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — self-installer; ensures plugin dependencies are present
 * @description
 * Checks whether required npm packages are installed in the plugin's own
 * node_modules and runs `npm install` in the plugin directory if anything is
 * missing. Called once at the start of init() before any other setup runs.
 *
 * Resolves the plugin directory via import.meta.url so it works correctly
 * whether the plugin is loaded through a dev symlink or a direct folder copy.
 *
 * @api-declaration
 * ensureDeps() — resolves when deps are present; runs npm install if needed
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [none]
 *     external_io:      [node:fs, child_process (npm install)]
 */

import path               from 'node:path';
import { access }         from 'node:fs/promises';
import { spawn }          from 'node:child_process';
import { fileURLToPath }  from 'node:url';

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));

const SENTINEL_PACKAGES = [
    '@anthropic-ai/sdk',
    '@modelcontextprotocol/sdk',
];

async function depsPresent() {
    for (const pkg of SENTINEL_PACKAGES) {
        try {
            await access(path.join(PLUGIN_DIR, 'node_modules', pkg));
        } catch {
            return false;
        }
    }
    return true;
}

function runNpmInstall() {
    return new Promise((resolve, reject) => {
        console.log('[CFM] Running npm install — this may take a minute on first run...');

        const proc = spawn('npm', ['install', '--prefer-offline'], {
            cwd:   PLUGIN_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
        });

        proc.stdout.on('data', d => process.stdout.write(`[CFM install] ${d}`));
        proc.stderr.on('data', d => process.stderr.write(`[CFM install] ${d}`));

        proc.on('exit', code => {
            if (code === 0) {
                console.log('[CFM] npm install complete.');
                resolve();
            } else {
                reject(new Error(`npm install exited with code ${code}`));
            }
        });

        proc.on('error', reject);
    });
}

export async function ensureDeps() {
    if (await depsPresent()) return;
    await runNpmInstall();
}
