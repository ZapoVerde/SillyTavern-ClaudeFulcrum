/**
 * @file sandbox/transport/http.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — HTTP+SSE MCP transport for Docker container mode
 * @description
 * Starts an Express server on CFM_SANDBOX_PORT (default 7860) and wires the
 * MCP SSEServerTransport to it. Used when CFM_SANDBOX_MODE=http. Each GET
 * /mcp opens an SSE stream; POST /mcp/messages delivers client messages.
 * GET /health is a plain JSON ping for compose healthchecks.
 *
 * @api-declaration
 * startHttp(server) — starts Express; resolves when the server is listening
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [active SSE transports map]
 *     external_io:      [TCP port CFM_SANDBOX_PORT]
 */

import express                from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const PORT = parseInt(process.env.CFM_SANDBOX_PORT ?? '7860', 10);

export async function startHttp(mcpServer) {
    const app        = express();
    const transports = new Map();

    app.use(express.json());

    app.get('/health', (_req, res) => res.json({ ok: true, name: 'cfm-sandbox' }));

    app.get('/mcp', async (req, res) => {
        const transport = new SSEServerTransport('/mcp/messages', res);
        transports.set(transport.sessionId, transport);
        res.on('close', () => transports.delete(transport.sessionId));
        await mcpServer.connect(transport);
    });

    app.post('/mcp/messages', async (req, res) => {
        const transport = transports.get(req.query.sessionId);
        if (!transport) return res.status(404).json({ error: 'Session not found' });
        await transport.handlePostMessage(req, res);
    });

    return new Promise((resolve) => {
        app.listen(PORT, '0.0.0.0', () => {
            console.error(`[cfm-sandbox] HTTP+SSE listening on :${PORT}`);
            resolve();
        });
    });
}
