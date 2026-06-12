/**
 * @file plugin/sandbox-manager.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Stateful + IO Wrapper — owns the MCP client and tool routing
 * @description
 * Manages the connection to cfm-sandbox (stdio subprocess for rawdog installs,
 * HTTP+SSE for Docker). Also routes tool calls: filesystem tools (read_file,
 * write_file, list_directory, search_files) are dispatched to the plugin-side
 * filesystem proxy because the sandbox container has no access to ST's
 * filesystem. All other tools (run_bash, git_*, web_fetch) go to the MCP client.
 *
 * If the sandbox binary is not installed (npm install not yet run), init logs
 * a warning and continues — the plugin works without it; the direct runner
 * will have no tools available until the sandbox is installed.
 *
 * @api-declaration
 * initSandbox()             — connect to sandbox; no-op if already connected
 * shutdownSandbox()         — close MCP client; terminate subprocess if stdio
 * callTool(name, args)      — dispatch to proxy or MCP; returns MCP result shape
 * listTools()               — all available tool defs (proxy + MCP)
 * getSandboxStatus()        — { mode, connected, toolCount, tools[] }
 *
 * @contract
 *   assertions:
 *     purity:           Stateful (owns _client, _mcpTools, _connected, _mode)
 *     state_ownership:  [_client, _mcpTools, _connected, _mode]
 *     external_io:      [@modelcontextprotocol/sdk Client, node:child_process via StdioClientTransport]
 */

import path           from 'node:path';
import { access }    from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PROXY_TOOL_NAMES, getProxyToolDefs, callProxyTool } from './tools/filesystem-proxy.js';

// MCP SDK is loaded dynamically in initSandbox() so the plugin loads cleanly
// even before npm install has been run with the new packages.

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_JS   = path.join(__dirname, '..', 'sandbox', 'server.js');

// ─── State ────────────────────────────────────────────────────────────────────

let _client    = null;
let _mode      = null;
let _mcpTools  = [];
let _connected = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initSandbox() {
    if (_client) return;

    const sandboxUrl = process.env.CFM_SANDBOX_URL;
    _mode = sandboxUrl ? 'http' : 'stdio';

    if (_mode === 'stdio') {
        try {
            await access(SANDBOX_JS);
        } catch {
            console.warn('[CFM sandbox] sandbox/server.js not found — run: cd sandbox && npm install');
            console.warn('[CFM sandbox] Direct runner will have no MCP tools until sandbox is installed.');
            return;
        }
    }

    try {
        const { Client }               = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

        if (_mode === 'http') {
            const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
            const transport = new SSEClientTransport(new URL(`${sandboxUrl}/mcp`));
            _client = new Client({ name: 'cfm-plugin', version: '0.1.0' }, { capabilities: {} });
            await _client.connect(transport);
        } else {
            const transport = new StdioClientTransport({
                command: 'node',
                args:    [SANDBOX_JS],
                env:     { ...process.env, CFM_APP_ROOT: process.cwd() },
            });
            _client = new Client({ name: 'cfm-plugin', version: '0.1.0' }, { capabilities: {} });
            await _client.connect(transport);
        }

        const { tools } = await _client.listTools();
        _mcpTools  = tools;
        _connected = true;
        console.log(`[CFM sandbox] Connected (${_mode}). MCP tools: ${_mcpTools.map(t => t.name).join(', ')}`);
    } catch (err) {
        if (err.code === 'ERR_MODULE_NOT_FOUND' && err.message.includes('@modelcontextprotocol')) {
            console.warn('[CFM sandbox] @modelcontextprotocol/sdk not installed — run: cd plugin && npm install');
            console.warn('[CFM sandbox] Filesystem proxy tools still available; MCP tools (shell, git, web) require npm install.');
        } else {
            console.warn(`[CFM sandbox] Connection failed (${_mode}): ${err.message}`);
        }
        _client    = null;
        _connected = false;
    }
}

export async function shutdownSandbox() {
    if (!_client) return;
    try { await _client.close(); } catch {}
    _client    = null;
    _connected = false;
    console.log('[CFM sandbox] Disconnected.');
}

// ─── Tool dispatch ────────────────────────────────────────────────────────────

export async function callTool(name, args) {
    if (PROXY_TOOL_NAMES.has(name)) {
        return callProxyTool(name, args);
    }
    if (!_client || !_connected) {
        return { content: [{ type: 'text', text: 'Sandbox not connected.' }], isError: true };
    }
    return _client.callTool({ name, arguments: args });
}

// ─── Status / introspection ───────────────────────────────────────────────────

export function listTools() {
    return [...getProxyToolDefs(), ..._mcpTools];
}

export function getSandboxStatus() {
    const tools = listTools();
    return {
        mode:      _mode,
        connected: _connected,
        toolCount: tools.length,
        tools:     tools.map(t => t.name),
    };
}
