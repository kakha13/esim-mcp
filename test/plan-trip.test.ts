import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/server.js';
import type { CheapereSIMClient } from '../src/client.js';
import type { Plan } from '../src/schemas.js';

function plan(over: Partial<Plan>): Plan {
    return {
        id: 1, group_id: null, name: 'Plan', scope: 'local',
        data_amount_mb: 5120, data_gb: 5, is_unlimited: false, duration_days: 30,
        price_cents: 1000, price_formatted: '$10.00', currency: 'USD',
        price_per_gb_cents: 200, provider: 'eSIM Access', destination_count: 1,
        covers_requested: ['JP'], covers_all_requested: false,
        buy_url: 'https://cheaperesim.com/esim/japan?package=1&utm_source=mcp',
        ...over
    };
}

async function connect(client: Partial<CheapereSIMClient>) {
    const server = buildServer(client as CheapereSIMClient);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const mcp = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([mcp.connect(a), server.connect(b)]);
    return mcp;
}

describe('plan_trip', () => {
    it('recommends one regional plan over a more expensive local stack', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({
                plans: [
                    plan({ id: 10, scope: 'regional', group_id: 5, name: 'Asia 10GB', price_cents: 2000, destination_count: 22, covers_requested: ['JP', 'KR'], covers_all_requested: true }),
                    plan({ id: 1, name: 'Japan 5GB', price_cents: 1500, covers_requested: ['JP'] }),
                    plan({ id: 2, name: 'Korea 5GB', price_cents: 1500, covers_requested: ['KR'] })
                ],
                unmatched: []
            }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'KR'], days: 14 } });
        const text = JSON.stringify(result.content);

        expect(result.isError).toBeFalsy();
        expect(text).toContain('Asia 10GB');
        expect(text).toContain('$20.00');
        expect(text).toContain('$30.00');
        expect((result.structuredContent as { recommendation: string }).recommendation).toBe('single');
    });

    it('recommends the local stack and still shows the single plan it rejected', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({
                plans: [
                    plan({ id: 10, scope: 'regional', group_id: 5, name: 'Asia 10GB', price_cents: 5000, covers_requested: ['JP', 'KR'], covers_all_requested: true }),
                    plan({ id: 1, name: 'Japan 5GB', price_cents: 800, covers_requested: ['JP'] }),
                    plan({ id: 2, name: 'Korea 5GB', price_cents: 900, covers_requested: ['KR'] })
                ],
                unmatched: []
            }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'KR'] } });

        expect((result.structuredContent as { recommendation: string }).recommendation).toBe('local');
        expect(JSON.stringify(result.content)).toContain('Asia 10GB');
    });

    it('says plainly when no single plan covers the trip', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({
                plans: [plan({ id: 1, price_cents: 800, covers_requested: ['JP'] }), plan({ id: 2, price_cents: 900, covers_requested: ['KR'] })],
                unmatched: []
            }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'KR'] } });
        const text = JSON.stringify(result.content).toLowerCase();

        expect(text).toContain('no single plan');
    });

    it('surfaces countries CheapereSIM does not sell', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({ plans: [plan({ id: 1, covers_requested: ['JP'] })], unmatched: ['XK'] }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'XK'] } });

        expect(JSON.stringify(result.content)).toContain('XK');
    });

    it('rejects an empty country list at the schema boundary', async () => {
        const searchPlans = vi.fn();
        const mcp = await connect({ searchPlans });

        // The SDK validates inputSchema before the handler runs, so an empty
        // array never reaches our code: it comes back as an isError result,
        // not a rejected promise. searchPlans must not be called either way.
        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: [] } });

        expect(result.isError).toBe(true);
        expect(searchPlans).not.toHaveBeenCalled();
    });

    it('asks for a wide result set so the comparison has candidates', async () => {
        const searchPlans = vi.fn(async () => ({ plans: [], unmatched: [] }));
        const mcp = await connect({ searchPlans });

        await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'KR'], days: 10 } });

        expect(searchPlans).toHaveBeenCalledWith(expect.objectContaining({ countries: ['JP', 'KR'], days: 10, limit: 50 }));
    });

    it('says plainly when no plans exist for this trip at all', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({ plans: [], unmatched: [] }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'KR'] } });

        expect(JSON.stringify(result.content)).toContain('No plans are available for this trip.');
        expect((result.structuredContent as { recommendation: string }).recommendation).toBe('none');
    });

    it('rejects a country name at the schema boundary rather than matching nothing later', async () => {
        const searchPlans = vi.fn();
        const mcp = await connect({ searchPlans });

        // compareTrip matches against covers_requested, which is always ISO
        // codes. A slug would fetch real plans and then match none of them,
        // printing "No plans are available for this trip" for a trip that has
        // plenty. Failing at the schema is the honest answer.
        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['japan'] } });

        expect(result.isError).toBe(true);
        expect(searchPlans).not.toHaveBeenCalled();
    });

    it('reports a missing country as a truncation caveat when the result set is full', async () => {
        // The API pools every requested country into one price-sorted list and
        // truncates at 50. A cheap high-inventory country can fill all 50 slots,
        // so absence from the candidate list is not absence from the catalogue.
        const japan = Array.from({ length: 50 }, (_, i) =>
            plan({ id: i + 1, name: `Japan plan ${i + 1}`, price_cents: 106 + i, covers_requested: ['JP'] })
        );
        const mcp = await connect({ searchPlans: vi.fn(async () => ({ plans: japan, unmatched: [] })) });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'VU'] } });
        const text = JSON.stringify(result.content);

        expect(text).toContain('within the top 50 results');
        expect(text).toContain('may be incomplete');
        expect(text).toContain('list_plans');
        expect(text).not.toContain('No local plan available for');
        expect((result.structuredContent as { results_truncated: boolean }).results_truncated).toBe(true);
    });

    it('still states a missing country plainly when the result set was not truncated', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({
                plans: [plan({ id: 1, price_cents: 800, covers_requested: ['JP'] })],
                unmatched: []
            }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'VU'] } });
        const text = JSON.stringify(result.content);

        expect(text).toContain('No local plan available for: VU.');
        expect(text).not.toContain('within the top 50 results');
        expect((result.structuredContent as { results_truncated: boolean }).results_truncated).toBe(false);
    });

    it('recommends the single plan because the local stack has a hole, not because it is tidier', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({
                plans: [
                    plan({ id: 10, scope: 'regional', group_id: 5, name: 'Asia 10GB', price_cents: 2000, covers_requested: ['JP', 'KR'], covers_all_requested: true }),
                    plan({ id: 1, name: 'Japan 5GB', price_cents: 500, covers_requested: ['JP'] })
                ],
                unmatched: []
            }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'KR'] } });
        const text = JSON.stringify(result.content);

        // "$5 vs $20, recommended $20 because it is simpler" invites a model to
        // override the recommendation. The real reason is that option 2 leaves
        // the traveller with no service in Korea.
        expect(text).toContain('Recommended: option 1, since option 2 does not cover: KR.');
        expect(text).not.toContain('simpler to install');
    });

    it('keeps the simpler-to-install reason for a genuine tie', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({
                plans: [
                    plan({ id: 10, scope: 'regional', group_id: 5, name: 'Asia 10GB', price_cents: 1600, covers_requested: ['JP', 'KR'], covers_all_requested: true }),
                    plan({ id: 1, name: 'Japan 5GB', price_cents: 800, covers_requested: ['JP'] }),
                    plan({ id: 2, name: 'Korea 5GB', price_cents: 800, covers_requested: ['KR'] })
                ],
                unmatched: []
            }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'KR'] } });

        expect(JSON.stringify(result.content)).toContain('simpler to install');
    });

    it('does not fabricate a $0.00 total when no local plan exists for any country', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({
                plans: [
                    plan({ id: 10, scope: 'regional', group_id: 5, name: 'Asia 10GB', price_cents: 2000, covers_requested: ['JP', 'KR'], covers_all_requested: true })
                ],
                unmatched: []
            }))
        });

        const result = await mcp.callTool({ name: 'plan_trip', arguments: { countries: ['JP', 'KR'] } });
        const text = JSON.stringify(result.content);

        expect(text).toContain('Option 2 - no local plans exist for any of these countries.');
        expect(text).not.toContain('$0.00');
    });
});

describe('get_plan_coverage', () => {
    it('lists the countries a plan covers', async () => {
        const mcp = await connect({
            getCoverage: vi.fn(async () => ({
                destination_count: 2,
                destinations: [
                    { name: 'Japan', slug: 'japan', iso_code: 'JP', flag_emoji: null },
                    { name: 'South Korea', slug: 'south-korea', iso_code: 'KR', flag_emoji: null }
                ]
            }))
        });

        const result = await mcp.callTool({ name: 'get_plan_coverage', arguments: { group_id: 5 } });

        expect(JSON.stringify(result.content)).toContain('Japan');
        expect((result.structuredContent as { destination_count: number }).destination_count).toBe(2);
    });

    it('explains a 404 instead of returning an empty list', async () => {
        const { ApiError } = await import('../src/client.js');
        const mcp = await connect({
            getCoverage: vi.fn(async () => {
                throw new ApiError('not_found', 'CheapereSIM has no record matching that request.');
            })
        });

        const result = await mcp.callTool({ name: 'get_plan_coverage', arguments: { group_id: 999999 } });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('no record');
    });
});
