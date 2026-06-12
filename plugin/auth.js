/**
 * @file plugin/auth.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — auth status check via cc-runner HTTP API
 * @description
 * Checks CC authentication status by calling the cc-runner sidecar.
 * Provides a 5-minute cache and the plugin HOME path (kept for any callers
 * that still reference it, though credentials now live in the cc-runner volume).
 *
 * @api-declaration
 * getPluginHome()      — absolute path to plugin/ directory
 * checkAuthStatus()    — { loggedIn, email } (5-min cache)
 * invalidateAuthCache() — clear the cache
 */

import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import { CC_RUNNER_URL } from './cc-runner-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_TTL = 5 * 60 * 1000;

let _cache = null;

export function getPluginHome() {
    return __dirname;
}

export async function checkAuthStatus() {
    if (_cache && Date.now() < _cache.expiresAt) {
        return { loggedIn: _cache.loggedIn, email: _cache.email };
    }
    const result = await _runAuthStatus();
    _cache = { ...result, expiresAt: Date.now() + CACHE_TTL };
    return result;
}

export function invalidateAuthCache() {
    _cache = null;
}

async function _runAuthStatus() {
    try {
        const res = await fetch(`${CC_RUNNER_URL}/auth/status`, {
            signal: AbortSignal.timeout(5000),
        });
        const data = await res.json();
        return { loggedIn: data.authenticated === true, email: data.email ?? null };
    } catch {
        return { loggedIn: false, email: null };
    }
}
