/**
 * @file sandbox/registry.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role Orchestrator — wires tool modules into an MCP Server instance
 * @description
 * Collects tool definitions from each tool module and attaches them to the
 * MCP Server's request handlers. The Server instance is owned by server.js;
 * this module only reads tool definitions and calls server.setRequestHandler.
 *
 * @api-declaration
 * registerTools(server) — attaches ListTools and CallTool handlers to the server
 *
 * @contract
 *   assertions:
 *     purity:           Orchestrator
 *     state_ownership:  [none]
 *     external_io:      [none]
 */

import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getShellTools } from './tools/shell.js';
import { getGitTools }   from './tools/git.js';
import { getWebTools }   from './tools/web.js';

function buildRegistry() {
    const all    = [...getShellTools(), ...getGitTools(), ...getWebTools()];
    const byName = Object.fromEntries(all.map(t => [t.name, t]));
    const defs   = all.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
    return { byName, defs };
}

export function registerTools(server) {
    const { byName, defs } = buildRegistry();

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: defs }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const tool = byName[request.params.name];
        if (!tool) {
            return {
                content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
                isError: true,
            };
        }
        return tool.handler(request.params.arguments ?? {});
    });
}
