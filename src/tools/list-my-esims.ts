import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from '../client.js';
import { toolError, toolSuccess } from './shared.js';

function gib(bytes: number | null): string {
    return bytes === null ? 'unknown' : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function registerListMyEsims(server: McpServer, client: CheapereSIMClient): void {
    server.registerTool(
        'list_my_esims',
        {
            description:
                'List the eSIMs on the configured CheapereSIM account, with status, destination, expiry, and data used. Requires CHEAPERESIM_API_TOKEN.',
            inputSchema: {}
        },
        async () => {
            try {
                const orders = await client.listOrders();

                if (orders.data.length === 0) {
                    return toolSuccess('This account has no eSIMs yet.', { orders: orders.data, total: orders.total });
                }

                const text = orders.data
                    .map(order =>
                        [
                            `${order.destination ?? 'Unknown destination'} - ${order.package_name ?? 'plan'}`,
                            `  status: ${order.status}${order.smdp_status ? ` (${order.smdp_status})` : ''}`,
                            `  data: ${gib(order.data_used_bytes)} used of ${gib(order.data_total_bytes)}`,
                            `  expires: ${order.expires_at ?? 'not set'}`,
                            `  id: ${order.uuid}`
                        ].join('\n')
                    )
                    .join('\n\n');

                const suffix = orders.last_page > 1 ? `\n\nShowing page 1 of ${orders.last_page}.` : '';

                return toolSuccess(text + suffix, { orders: orders.data, total: orders.total });
            } catch (error) {
                return toolError(error);
            }
        }
    );
}
