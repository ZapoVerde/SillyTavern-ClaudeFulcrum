/**
 * @file plugin/runners/direct.js
 * @stamp 2026-06-11T00:00:00.000Z
 * @architectural-role IO Wrapper — calls Anthropic SDK directly, no tools
 * @description
 * Pure conversational Claude via the Anthropic SDK with streaming. No
 * filesystem access, no tool use. Used for lightweight queries or when
 * CC usage is exhausted. Yields normalised event objects matching the
 * shape the SSE server expects.
 *
 * @api-declaration
 * run(opts)           — async generator; yields normalised event objects
 *   opts.prompt       — prompt string
 *   opts.signal       — AbortSignal to cancel the request
 *
 * @contract
 *   assertions:
 *     purity:           IO Wrapper
 *     state_ownership:  [none]
 *     external_io:      [Anthropic API]
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-8';

export async function* run({ prompt, signal }) {
    const client = new Anthropic();

    const stream = await client.messages.stream({
        model:      MODEL,
        max_tokens: 8096,
        messages:   [{ role: 'user', content: prompt }],
    });

    if (signal) {
        signal.addEventListener('abort', () => {
            try { stream.abort(); } catch {}
        }, { once: true });
    }

    for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            yield { type: 'assistant', text: event.delta.text };
        }
        if (event.type === 'message_stop') {
            yield { type: 'result', subtype: 'success' };
        }
    }

    if (signal?.aborted) {
        yield { type: 'result', subtype: 'cancelled' };
    }
}
