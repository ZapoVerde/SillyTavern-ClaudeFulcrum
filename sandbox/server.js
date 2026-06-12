/**
 * @file sandbox/server.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Orchestrator — MCP server entry point; selects and starts transport
 * @description
 * Creates the MCP Server, registers all tools, then starts the appropriate
 * transport. CFM_SANDBOX_MODE=http → HTTP+SSE on port 7860 (Docker container
 * mode). Anything else → stdio (rawdog: spawned as subprocess by the plugin).
 * The CFM_APP_ROOT env var is read by tool modules to resolve paths.
 *
 * @api-declaration
 * (entry point — not a library)
 *
 * @contract
 *   assertions:
 *     purity:           Orchestrator
 *     state_ownership:  [server instance, transport instance]
 *     external_io:      [stdio or TCP:7860]
 */

import { Server }               from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools }        from './registry.js';

const server = new Server(
    { name: 'cfm-sandbox', version: '0.1.0' },
    { capabilities: { tools: {} } },
);

registerTools(server);

if (process.env.CFM_SANDBOX_MODE === 'http') {
    const { startHttp } = await import('./transport/http.js');
    await startHttp(server);
} else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
