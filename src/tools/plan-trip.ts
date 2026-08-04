import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from '../client.js';
import { compareTrip } from '../trip.js';
import { formatPlanLine, formatPrice } from '../format.js';
import { toolError, toolSuccess } from './shared.js';

/** Ask for the widest result set the API allows, so the comparison sees real candidates. */
const CANDIDATE_LIMIT = 50;

export function registerPlanTrip(server: McpServer, client: CheapereSIMClient): void {
    server.registerTool(
        'plan_trip',
        {
            description:
                'Work out the cheapest way to stay connected across several countries. Compares one regional plan covering the whole trip against buying a local plan per country, and says which is cheaper. Use this whenever the user names more than one destination.',
            inputSchema: {
                countries: z
                    .array(z.string())
                    .min(1)
                    .max(10)
                    .describe('ISO country codes or slugs, for example ["JP", "KR", "TW"]'),
                days: z.number().int().positive().optional().describe('Trip length in days'),
                min_data_gb: z.number().positive().optional().describe('Minimum data needed across the trip')
            }
        },
        async ({ countries, days, min_data_gb }) => {
            try {
                const { plans, unmatched } = await client.searchPlans({
                    countries,
                    days,
                    minDataGb: min_data_gb,
                    limit: CANDIDATE_LIMIT
                });

                const comparison = compareTrip(plans, countries);
                const lines: string[] = [];

                if (unmatched.length > 0) {
                    lines.push(`CheapereSIM does not sell plans for: ${unmatched.join(', ')}.`);
                }

                if (comparison.recommendation === 'none') {
                    lines.push('No plans are available for this trip.');
                    return toolSuccess(lines.join('\n'), { ...comparison, unmatched });
                }

                if (comparison.singlePlan) {
                    lines.push(
                        `Option 1 - one plan covering everything, ${formatPrice(comparison.singleTotalCents ?? 0)}:`,
                        formatPlanLine(comparison.singlePlan)
                    );
                } else {
                    lines.push('Option 1 - no single plan covers every country on this trip.');
                }

                if (comparison.localStack.plans.length > 0) {
                    lines.push(
                        '',
                        `Option 2 - one local plan per country, ${formatPrice(comparison.localTotalCents ?? 0)} total:`,
                        ...comparison.localStack.plans.map(formatPlanLine)
                    );
                } else {
                    lines.push('', 'Option 2 - no local plans exist for any of these countries.');
                }
                if (comparison.localStack.missing.length > 0) {
                    lines.push(`No local plan available for: ${comparison.localStack.missing.join(', ')}.`);
                }

                lines.push('');
                if (comparison.savingsCents !== null && comparison.savingsCents > 0) {
                    lines.push(
                        comparison.recommendation === 'single'
                            ? `Recommended: option 1, saving ${formatPrice(comparison.savingsCents)}.`
                            : `Recommended: option 2, saving ${formatPrice(comparison.savingsCents)}.`
                    );
                } else {
                    lines.push(
                        comparison.recommendation === 'single'
                            ? 'Recommended: option 1, since one eSIM is simpler to install than several.'
                            : comparison.localStack.missing.length > 0
                              ? `Recommended: option 2, but it does not cover: ${comparison.localStack.missing.join(', ')}.`
                              : 'Recommended: option 2.'
                    );
                }

                return toolSuccess(lines.join('\n'), { ...comparison, unmatched });
            } catch (error) {
                return toolError(error);
            }
        }
    );
}
