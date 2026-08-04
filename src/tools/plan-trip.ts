import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from '../client.js';
import { compareTrip } from '../trip.js';
import { formatPlanLine, formatPrice } from '../format.js';
import { toolError, toolSuccess } from './shared.js';

/**
 * Ask for the widest result set the API allows, so the comparison sees real candidates.
 *
 * The API pools every requested country into one price-ascending list and then
 * truncates it, so a cheap high-inventory country can fill every slot. When the
 * response comes back full, a country's absence from the candidate list is not
 * evidence that CheapereSIM has nothing for it, and the tool must not say so.
 */
const CANDIDATE_LIMIT = 50;

export function registerPlanTrip(server: McpServer, client: CheapereSIMClient): void {
    server.registerTool(
        'plan_trip',
        {
            description:
                'Work out the cheapest way to stay connected across several countries. Compares one regional plan covering the whole trip against buying a local plan per country, and says which is cheaper. Use this whenever the user names more than one destination.',
            inputSchema: {
                countries: z
                    .array(z.string().regex(/^[A-Za-z]{2}$/, 'Use a two-letter ISO country code, for example JP'))
                    .min(1)
                    .max(10)
                    .describe(
                        'Two-letter ISO country codes, for example ["JP", "KR", "TW"]. This tool does not accept country names or slugs: call search_destinations first to get the code.'
                    ),
                days: z.number().int().positive().optional().describe('Trip length in days'),
                min_data_gb: z
                    .number()
                    .positive()
                    .optional()
                    .describe('Minimum data per plan, in GB. Unlimited plans always qualify')
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

                // A full result set means the API had more to give, so the
                // candidate list is only a prefix of the real catalogue.
                const resultsTruncated = plans.length === CANDIDATE_LIMIT;
                const structured = { ...comparison, unmatched, results_truncated: resultsTruncated };
                const lines: string[] = [];

                if (unmatched.length > 0) {
                    lines.push(`CheapereSIM does not sell plans for: ${unmatched.join(', ')}.`);
                }

                if (comparison.recommendation === 'none') {
                    lines.push('No plans are available for this trip.');
                    return toolSuccess(lines.join('\n'), structured);
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
                    const missing = comparison.localStack.missing.join(', ');
                    lines.push(
                        resultsTruncated
                            ? `No local plan for ${missing} was found within the top ${CANDIDATE_LIMIT} results, so this comparison may be incomplete. Use list_plans for ${missing} to check directly.`
                            : `No local plan available for: ${missing}.`
                    );
                }

                lines.push('');
                if (comparison.savingsCents !== null && comparison.savingsCents > 0) {
                    lines.push(
                        comparison.recommendation === 'single'
                            ? `Recommended: option 1, saving ${formatPrice(comparison.savingsCents)}.`
                            : `Recommended: option 2, saving ${formatPrice(comparison.savingsCents)}.`
                    );
                } else if (comparison.recommendation === 'single') {
                    // Without a saving to point at, the reason has to be the real
                    // one. "Simpler to install" against a visibly cheaper option 2
                    // reads as a weak preference a model may override, when in fact
                    // option 2 would leave the traveller with no service somewhere.
                    lines.push(
                        comparison.localStack.missing.length > 0
                            ? `Recommended: option 1, since option 2 does not cover: ${comparison.localStack.missing.join(', ')}.`
                            : 'Recommended: option 1, since one eSIM is simpler to install than several.'
                    );
                } else {
                    lines.push(
                        comparison.localStack.missing.length > 0
                            ? `Recommended: option 2, but it does not cover: ${comparison.localStack.missing.join(', ')}.`
                            : 'Recommended: option 2.'
                    );
                }

                return toolSuccess(lines.join('\n'), structured);
            } catch (error) {
                return toolError(error);
            }
        }
    );
}
