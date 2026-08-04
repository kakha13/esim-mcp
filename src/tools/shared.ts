import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from '../client.js';

/**
 * Turn anything thrown inside a tool into a result the model can read.
 *
 * A thrown error under stdio can take the whole session down, so every
 * handler funnels through here. An unexpected error never surfaces its
 * own message, which could contain internals.
 */
export function toolError(error: unknown): CallToolResult {
    const text =
        error instanceof ApiError
            ? error.userMessage
            : 'Something went wrong talking to CheapereSIM. Try again in a moment.';

    return { content: [{ type: 'text', text }], isError: true };
}

/** Text plus structured content, the shape every successful tool returns. */
export function toolSuccess(text: string, structuredContent: Record<string, unknown>): CallToolResult {
    return { content: [{ type: 'text', text }], structuredContent };
}
