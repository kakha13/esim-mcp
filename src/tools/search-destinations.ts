import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from '../client.js';
import { toolError, toolSuccess } from './shared.js';

export function registerSearchDestinations(server: McpServer, client: CheapereSIMClient): void {
    server.registerTool(
        'search_destinations',
        {
            description:
                'Find countries CheapereSIM sells eSIM plans for, by full or partial name. Use this when the user names a place and you need its country code before looking up plans. Do not use it to compare prices or list plans: use list_plans for a single country, or plan_trip for several.',
            inputSchema: { query: z.string().min(2).describe('Country name or partial name, for example "jap" or "south kor"') }
        },
        async ({ query }) => {
            try {
                const { destinations } = await client.searchDestinations(query);

                if (destinations.length === 0) {
                    return toolSuccess(`No destinations match "${query}". CheapereSIM may not sell plans there.`, {
                        destinations: []
                    });
                }

                const text = destinations
                    .map(d => `${d.name} (${d.iso_code ?? 'no code'}) - from ${d.from_price ?? 'n/a'}`)
                    .join('\n');

                return toolSuccess(text, { destinations });
            } catch (error) {
                return toolError(error);
            }
        }
    );
}
