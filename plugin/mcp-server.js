/**
 * @file plugin/mcp-server.js
 * @stamp 2026-06-12T00:00:00.000Z
 * @architectural-role IO Wrapper — HTTP+SSE MCP server exposing ST-domain tools to CC
 * @description
 * Starts an HTTP server on CFM_MCP_PORT (default 7861) within the ST plugin
 * process. Uses SSEServerTransport so CC can connect via --mcp-config with
 * type "sse". Serves the ST-domain tools (characters, lorebooks, settings).
 * Runs in the ST container and therefore has full access to the ST filesystem.
 *
 * @api-declaration
 * startMcpServer()    — starts the HTTP server; resolves when listening
 * shutdownMcpServer() — closes the HTTP server
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [_server, _transports]
 *     external_io:      [TCP:CFM_MCP_PORT]
 */

import http                       from 'node:http';
import { Server }                 from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport }     from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getStDomainTools }       from './tools/st-domain.js';

const PORT = parseInt(process.env.CFM_MCP_PORT ?? '7861', 10);

// ─── State ────────────────────────────────────────────────────────────────────

let _server     = null;
let _transports = new Map(); // sessionId → SSEServerTransport

// ─── MCP server setup ─────────────────────────────────────────────────────────

function buildMcpServer() {
    const mcp    = new Server(
        { name: 'sillytavern', version: '0.1.0' },
        { capabilities: { tools: {} } },
    );
    const tools  = getStDomainTools();
    const byName = Object.fromEntries(tools.map(t => [t.name, t]));
    const defs   = tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: defs }));
    mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
        const tool = byName[req.params.name];
        if (!tool) return {
            content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
            isError: true,
        };
        return tool.handler(req.params.arguments ?? {});
    });

    return mcp;
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

export function startMcpServer() {
    const mcp = buildMcpServer();

    _server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost`);

        if (req.method === 'GET' && url.pathname === '/mcp') {
            const transport = new SSEServerTransport('/mcp/messages', res);
            _transports.set(transport.sessionId, transport);
            res.on('close', () => _transports.delete(transport.sessionId));
            mcp.connect(transport).catch(e => {
                console.error('[CFM mcp] connect error:', e.message);
            });
            return;
        }

        if (req.method === 'POST' && url.pathname === '/mcp/messages') {
            const sessionId  = url.searchParams.get('sessionId');
            const transport  = _transports.get(sessionId);
            if (!transport) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Session not found' }));
                return;
            }
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', () => {
                req.body = body ? JSON.parse(body) : {};
                transport.handlePostMessage(req, res).catch(e => {
                    console.error('[CFM mcp] handlePostMessage error:', e.message);
                });
            });
            return;
        }

        if (req.method === 'GET' && url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, name: 'sillytavern', tools: getStDomainTools().length }));
            return;
        }

        res.writeHead(404);
        res.end();
    });

    return new Promise((resolve, reject) => {
        _server.listen(PORT, '0.0.0.0', () => {
            console.log(`[CFM mcp] Listening on :${PORT} (${getStDomainTools().length} tools)`);
            resolve();
        });
        _server.on('error', reject);
    });
}

export function shutdownMcpServer() {
    if (!_server) return Promise.resolve();
    return new Promise((resolve) => {
        _server.close(() => {
            _server = null;
            _transports.clear();
            console.log('[CFM mcp] Stopped.');
            resolve();
        });
    });
}
