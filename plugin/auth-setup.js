/**
 * @file plugin/auth-setup.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — drives the setup-token flow via cc-runner HTTP API
 *
 * @api-declaration
 * startSetupToken()           — resolves { setupId, url } when cc-runner returns the auth URL
 * submitToken(setupId, token) — submits token; resolves when setup completes
 * cancelSetup()               — tells cc-runner to abort any active setup-token subprocess
 */

import { CC_RUNNER_URL } from './cc-runner-url.js';

export async function startSetupToken() {
    const res = await fetch(`${CC_RUNNER_URL}/auth/start-setup`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `cc-runner returned ${res.status}`);
    return { setupId: data.setupId, url: data.url };
}

export async function submitToken(setupId, token) {
    const res = await fetch(`${CC_RUNNER_URL}/auth/complete-setup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ setupId, token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `cc-runner returned ${res.status}`);
    return data;
}

export function cancelSetup() {
    fetch(`${CC_RUNNER_URL}/auth/cancel-setup`, { method: 'POST' }).catch(() => {});
}

export async function saveRawToken(token) {
    const res = await fetch(`${CC_RUNNER_URL}/auth/set-token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `cc-runner returned ${res.status}`);
    return data;
}
