import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from '../client.js';
import { formatPrice } from '../format.js';
import { toolError, toolSuccess } from './shared.js';

export function registerListPopularDestinations(server: McpServer, client: CheapereSIMClient): void {
    server.registerTool(
        'list_popular_destinations',
        {
            description:
                'List the destinations travellers buy eSIMs for most often, with a starting price for each. Use this only when the user has not named a destination and wants ideas. If they already named one country use list_plans, and if they named several use plan_trip.',
            inputSchema: {}
        },
        async () => {
            try {
                const { destinations } = await client.getPopular();

                const text = destinations
                    .map(d => {
                        const from = d.cheapest_price_cents === null ? 'n/a' : formatPrice(d.cheapest_price_cents);
                        return `${d.name} (${d.iso_code ?? 'no code'}) - from ${from}, ${d.package_count} plans`;
                    })
                    .join('\n');

                return toolSuccess(text || 'No popular destinations are listed right now.', { destinations });
            } catch (error) {
                return toolError(error);
            }
        }
    );
}
