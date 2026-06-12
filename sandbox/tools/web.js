/**
 * @file sandbox/tools/web.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — fetches URLs and returns response body
 * @description
 * Provides the web_fetch tool using Node's built-in fetch. Response body
 * is truncated at 50 KB to keep context sizes reasonable. Requires Node 18+
 * (available in all current ST Docker images).
 *
 * @api-declaration
 * getWebTools() — returns array of MCP tool definition objects
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [none]
 *     external_io:      [fetch / HTTP]
 */

const MAX_BYTES = 50_000;

export function getWebTools() {
    return [
        {
            name:        'web_fetch',
            description: 'Fetch a URL and return the response body (truncated to 50 KB).',
            inputSchema: {
                type:       'object',
                properties: {
                    url:     { type: 'string', description: 'URL to fetch' },
                    method:  { type: 'string', description: 'HTTP method (default GET)' },
                    headers: { type: 'object', description: 'Optional request headers' },
                    body:    { type: 'string', description: 'Request body for POST/PUT' },
                },
                required: ['url'],
            },
            handler: async ({ url, method = 'GET', headers = {}, body }) => {
                try {
                    const resp = await fetch(url, {
                        method,
                        headers,
                        body:   body ?? undefined,
                        signal: AbortSignal.timeout(15000),
                    });
                    const text      = await resp.text();
                    const truncated = text.length > MAX_BYTES
                        ? text.slice(0, MAX_BYTES) + '\n… (truncated)'
                        : text;
                    return {
                        content: [{ type: 'text', text: `HTTP ${resp.status} ${resp.statusText}\n\n${truncated}` }],
                        isError: !resp.ok,
                    };
                } catch (err) {
                    return { content: [{ type: 'text', text: `Fetch error: ${err.message}` }], isError: true };
                }
            },
        },
    ];
}
