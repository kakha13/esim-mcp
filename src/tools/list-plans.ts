import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from '../client.js';
import { formatPlanLine } from '../format.js';
import { toolError, toolSuccess } from './shared.js';

export function registerListPlans(server: McpServer, client: CheapereSIMClient): void {
    server.registerTool(
        'list_plans',
        {
            description:
                'List eSIM plans for one country, cheapest first. Use plan_trip instead when the user is visiting more than one country.',
            inputSchema: {
                country: z.string().describe('ISO country code such as JP, or a slug such as south-korea'),
                days: z.number().int().positive().optional().describe('Only plans lasting at least this many days'),
                min_data_gb: z.number().positive().optional().describe('Only plans with at least this much data. Unlimited plans always qualify'),
                limit: z.number().int().min(1).max(50).optional().describe('How many plans to return, default 20')
            }
        },
        async ({ country, days, min_data_gb, limit }) => {
            try {
                const { plans, unmatched } = await client.searchPlans({
                    countries: [country],
                    days,
                    minDataGb: min_data_gb,
                    limit: limit ?? 20
                });

                if (unmatched.length > 0) {
                    return toolSuccess(
                        `CheapereSIM does not sell plans for "${unmatched.join(', ')}". Try search_destinations to find the right country.`,
                        { plans, unmatched }
                    );
                }

                if (plans.length === 0) {
                    return toolSuccess(`No plans for ${country} match those filters.`, { plans, unmatched });
                }

                return toolSuccess(plans.map(formatPlanLine).join('\n\n'), { plans, unmatched });
            } catch (error) {
                return toolError(error);
            }
        }
    );
}
