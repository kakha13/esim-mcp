import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from '../client.js';
import { toolError, toolSuccess } from './shared.js';

export function registerGetPlanCoverage(server: McpServer, client: CheapereSIMClient): void {
    server.registerTool(
        'get_plan_coverage',
        {
            description:
                'List every country a regional or global plan covers. Takes the group_id from a plan returned by plan_trip or list_plans. Local plans have a null group_id and cover only their own country.',
            inputSchema: { group_id: z.number().int().positive().describe('The plan group id, from a plan\'s group_id field') }
        },
        async ({ group_id }) => {
            try {
                const coverage = await client.getCoverage(group_id);

                const text = [
                    `Covers ${coverage.destination_count} countries:`,
                    coverage.destinations.map(d => `${d.name} (${d.iso_code ?? 'no code'})`).join(', ')
                ].join('\n');

                return toolSuccess(text, coverage);
            } catch (error) {
                return toolError(error);
            }
        }
    );
}
