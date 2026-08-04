import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from '../client.js';
import { toolError, toolSuccess } from './shared.js';

export function registerGetEsimUsage(server: McpServer, client: CheapereSIMClient): void {
    server.registerTool(
        'get_esim_usage',
        {
            description:
                'Show how much data is left on one eSIM. Takes the order uuid from list_my_esims. Requires CHEAPERESIM_API_TOKEN.',
            inputSchema: { order_uuid: z.string().describe('The eSIM order uuid, from list_my_esims') }
        },
        async ({ order_uuid }) => {
            try {
                const result = await client.getUsage(order_uuid);

                if (!result.usage) {
                    return toolSuccess(
                        result.message ?? 'Usage data is not available for this eSIM yet.',
                        { usage: null }
                    );
                }

                const usage = result.usage;
                const text = [
                    `Used: ${usage.data_used_formatted ?? 'unknown'}`,
                    `Remaining: ${usage.data_remaining_formatted ?? 'unknown'}`,
                    usage.usage_percent === null ? null : `Consumed: ${usage.usage_percent}%`,
                    `Active: ${usage.is_active === null ? 'unknown' : usage.is_active ? 'yes' : 'no'}`,
                    usage.last_checked_at === null ? null : `Last checked: ${usage.last_checked_at}`
                ]
                    .filter((line): line is string => line !== null)
                    .join('\n');

                return toolSuccess(text, { usage });
            } catch (error) {
                return toolError(error);
            }
        }
    );
}
