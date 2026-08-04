import { describe, it, expect } from 'vitest';
import { compareTrip } from '../src/trip.js';
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

describe('compareTrip', () => {
    it('recommends the single plan when it beats the local stack', () => {
        const regional = plan({ id: 10, scope: 'regional', group_id: 5, price_cents: 2000, covers_requested: ['JP', 'KR'], covers_all_requested: true });
        const jp = plan({ id: 1, price_cents: 1500, covers_requested: ['JP'] });
        const kr = plan({ id: 2, price_cents: 1500, covers_requested: ['KR'] });

        const result = compareTrip([regional, jp, kr], ['JP', 'KR']);

        expect(result.recommendation).toBe('single');
        expect(result.singlePlan?.id).toBe(10);
        expect(result.singleTotalCents).toBe(2000);
        expect(result.localTotalCents).toBe(3000);
        expect(result.savingsCents).toBe(1000);
    });

    it('recommends the local stack when it is cheaper', () => {
        const regional = plan({ id: 10, scope: 'regional', group_id: 5, price_cents: 5000, covers_requested: ['JP', 'KR'], covers_all_requested: true });
        const jp = plan({ id: 1, price_cents: 800, covers_requested: ['JP'] });
        const kr = plan({ id: 2, price_cents: 900, covers_requested: ['KR'] });

        const result = compareTrip([regional, jp, kr], ['JP', 'KR']);

        expect(result.recommendation).toBe('local');
        expect(result.localTotalCents).toBe(1700);
        expect(result.savingsCents).toBe(3300);
    });

    it('picks the cheapest local plan per country, not the first', () => {
        const result = compareTrip(
            [
                plan({ id: 1, price_cents: 2000, covers_requested: ['JP'] }),
                plan({ id: 2, price_cents: 700, covers_requested: ['JP'] }),
                plan({ id: 3, price_cents: 900, covers_requested: ['KR'] })
            ],
            ['JP', 'KR']
        );

        expect(result.localStack?.plans.map(p => p.id)).toEqual([2, 3]);
        expect(result.localTotalCents).toBe(1600);
    });

    it('reports no single plan when none covers every country', () => {
        const result = compareTrip(
            [
                plan({ id: 1, price_cents: 500, covers_requested: ['JP'] }),
                plan({ id: 2, price_cents: 600, covers_requested: ['KR'] })
            ],
            ['JP', 'KR']
        );

        expect(result.singlePlan).toBeNull();
        expect(result.singleTotalCents).toBeNull();
        expect(result.recommendation).toBe('local');
        expect(result.savingsCents).toBeNull();
    });

    it('reports the countries the local stack cannot cover', () => {
        const result = compareTrip([plan({ id: 1, price_cents: 500, covers_requested: ['JP'] })], ['JP', 'KR', 'TW']);

        expect(result.localStack?.missing).toEqual(['KR', 'TW']);
        expect(result.recommendation).toBe('local');
    });

    it('returns none when there are no plans at all', () => {
        const result = compareTrip([], ['JP']);

        expect(result.recommendation).toBe('none');
        expect(result.singlePlan).toBeNull();
        expect(result.localStack?.plans).toEqual([]);
        expect(result.localStack?.missing).toEqual(['JP']);
    });

    it('never lets the local stack double-buy coverage a regional plan already provides', () => {
        const regional = plan({ id: 10, scope: 'regional', group_id: 5, price_cents: 250, covers_requested: ['JP', 'KR'], covers_all_requested: true });
        const krOnly = plan({ id: 2, price_cents: 200, covers_requested: ['KR'] });

        const result = compareTrip([regional, krOnly], ['JP', 'KR']);

        expect(result.localStack?.plans.map(p => p.id)).not.toContain(10);
        expect(result.localStack?.plans.map(p => p.id)).toEqual([2]);
        expect(result.localStack?.missing).toEqual(['JP']);
        expect(result.localTotalCents).toBe(200);
        expect(result.singlePlan?.id).toBe(10);
        expect(result.singleTotalCents).toBe(250);
    });

    it('never lets an incomplete local stack out-price a plan that covers everything', () => {
        const regional = plan({ id: 10, scope: 'regional', group_id: 5, price_cents: 2000, covers_requested: ['JP', 'KR'], covers_all_requested: true });
        const jpOnly = plan({ id: 1, price_cents: 500, covers_requested: ['JP'] });

        const result = compareTrip([regional, jpOnly], ['JP', 'KR']);

        expect(result.localStack?.missing).toEqual(['KR']);
        expect(result.recommendation).toBe('single');
        expect(result.savingsCents).toBeNull();
    });

    it('still recommends the incomplete local stack when no single plan covers everything', () => {
        const jpOnly = plan({ id: 1, price_cents: 500, covers_requested: ['JP'] });

        const result = compareTrip([jpOnly], ['JP', 'KR']);

        expect(result.recommendation).toBe('local');
        expect(result.localStack?.missing).toEqual(['KR']);
    });

    it('prefers the single plan on an exact tie, since one eSIM beats two', () => {
        const regional = plan({ id: 10, scope: 'regional', group_id: 5, price_cents: 1600, covers_requested: ['JP', 'KR'], covers_all_requested: true });
        const result = compareTrip(
            [regional, plan({ id: 1, price_cents: 800, covers_requested: ['JP'] }), plan({ id: 2, price_cents: 800, covers_requested: ['KR'] })],
            ['JP', 'KR']
        );

        expect(result.recommendation).toBe('single');
        expect(result.savingsCents).toBe(0);
    });

    it('chooses the cheapest covering plan when several cover everything', () => {
        const result = compareTrip(
            [
                plan({ id: 10, scope: 'regional', group_id: 5, price_cents: 3000, covers_requested: ['JP', 'KR'], covers_all_requested: true }),
                plan({ id: 11, scope: 'global', group_id: 6, price_cents: 2200, covers_requested: ['JP', 'KR'], covers_all_requested: true })
            ],
            ['JP', 'KR']
        );

        expect(result.singlePlan?.id).toBe(11);
    });

    it('matches countries case-insensitively', () => {
        const result = compareTrip([plan({ id: 1, price_cents: 500, covers_requested: ['JP'] })], ['jp']);

        expect(result.localStack?.plans.map(p => p.id)).toEqual([1]);
        expect(result.localStack?.missing).toEqual([]);
    });
});
