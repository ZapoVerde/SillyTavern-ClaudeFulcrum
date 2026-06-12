/**
 * @file plugin/runners/direct.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — Anthropic SDK runner with sandbox tool loop
 * @description
 * Calls the Anthropic API directly with streaming and a full agentic tool loop.
 * Tool definitions are fetched from sandbox-manager on each run (proxy tools +
 * MCP tools). When the model emits tool_use blocks, each tool is dispatched
 * through sandbox-manager.callTool() and the result is fed back as tool_result.
 * The loop continues until stop_reason is end_turn or the request is cancelled.
 *
 * Yields normalised event objects matching the shape the SSE server expects:
 *   { type: 'assistant', text }   — streamed text fragment
 *   { type: 'tool', name }        — tool call in progress (for UI progress)
 *   { type: 'result', subtype }   — 'success' | 'cancelled'
 *
 * @api-declaration
 * run(opts)         — async generator; yields normalised event objects
 *   opts.prompt     — prompt string
 *   opts.signal     — AbortSignal to cancel the request
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [none]
 *     external_io:      [Anthropic API, sandbox-manager]
 */

import Anthropic from '@anthropic-ai/sdk';
import { listTools, callTool } from '../sandbox-manager.js';

const MODEL      = 'claude-opus-4-8';
const MAX_TOKENS = 8096;

function toAnthropicTools(mcpDefs) {
    return mcpDefs.map(t => ({
        name:         t.name,
        description:  t.description,
        input_schema: t.inputSchema,
    }));
}

export async function* run({ prompt, signal }) {
    const client   = new Anthropic();
    const toolDefs = toAnthropicTools(listTools());
    const messages = [{ role: 'user', content: prompt }];

    while (true) {
        if (signal?.aborted) {
            yield { type: 'result', subtype: 'cancelled' };
            return;
        }

        const stream = client.messages.stream({
            model:      MODEL,
            max_tokens: MAX_TOKENS,
            messages,
            tools:      toolDefs.length > 0 ? toolDefs : undefined,
        });

        const abortHandler = () => { try { stream.abort(); } catch {} };
        signal?.addEventListener('abort', abortHandler, { once: true });

        try {
            for await (const event of stream) {
                if (signal?.aborted) break;
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    yield { type: 'assistant', text: event.delta.text };
                }
            }
        } finally {
            signal?.removeEventListener('abort', abortHandler);
        }

        if (signal?.aborted) {
            yield { type: 'result', subtype: 'cancelled' };
            return;
        }

        const msg = await stream.finalMessage();

        if (msg.stop_reason !== 'tool_use') {
            yield { type: 'result', subtype: 'success' };
            return;
        }

        // ── Tool use turn ──────────────────────────────────────────────────────
        messages.push({ role: 'assistant', content: msg.content });

        const toolResults = [];
        for (const block of msg.content.filter(b => b.type === 'tool_use')) {
            if (signal?.aborted) break;
            yield { type: 'tool', name: block.name };
            const result = await callTool(block.name, block.input ?? {});
            const text   = result?.content?.[0]?.text ?? JSON.stringify(result);
            toolResults.push({
                type:        'tool_result',
                tool_use_id: block.id,
                content:     text,
                is_error:    result?.isError ?? false,
            });
        }

        messages.push({ role: 'user', content: toolResults });
    }
}
