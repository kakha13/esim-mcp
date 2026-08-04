import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PlanSearchResponseSchema, ValidationErrorSchema } from '../src/schemas.js';

function fixture(name: string): { status: number; body: unknown } {
    return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
}

describe('PlanSearchResponseSchema', () => {
    it('accepts the real multi-country response', () => {
        const { body } = fixture('multi-country');
        const parsed = PlanSearchResponseSchema.parse(body);
        expect(parsed.plans).toHaveLength(2);
        expect(parsed.plans[0].scope).toBe('local');
        expect(parsed.plans[0].buy_url).toContain('utm_source=mcp');
        expect(parsed.unmatched).toEqual([]);
    });

    it('accepts a response carrying unmatched countries', () => {
        const { body } = fixture('unmatched');
        const parsed = PlanSearchResponseSchema.parse(body);
        expect(parsed.unmatched).toEqual(['Narnia']);
        expect(parsed.plans.every(p => p.covers_all_requested === false)).toBe(true);
    });

    it('accepts a regional plan with a group id and a null price_per_gb_cents', () => {
        // Hand-built: the capture machine had zero package_groups, so no real
        // regional fixture exists. Shape follows the published contract.
        const regional = {
            plans: [{
                id: 999, group_id: 42, name: 'Asia 10GB 30 Days', scope: 'regional',
                data_amount_mb: 0, data_gb: 0, is_unlimited: true, duration_days: 30,
                price_cents: 2450, price_formatted: '$24.50', currency: 'USD',
                price_per_gb_cents: null, provider: 'eSIM Access', destination_count: 22,
                covers_requested: ['JP', 'KR'], covers_all_requested: true,
                buy_url: 'https://cheaperesim.com/multi-country-esim?package=999&utm_source=mcp'
            }],
            unmatched: []
        };
        const parsed = PlanSearchResponseSchema.parse(regional);
        expect(parsed.plans[0].group_id).toBe(42);
        expect(parsed.plans[0].price_per_gb_cents).toBeNull();
    });

    it('rejects a response missing a contract key', () => {
        const { body } = fixture('multi-country') as { body: { plans: Record<string, unknown>[] } };
        delete body.plans[0].buy_url;
        expect(() => PlanSearchResponseSchema.parse(body)).toThrow();
    });
});

describe('ValidationErrorSchema', () => {
    it.each(['bad-scope', 'bad-limit', 'missing-countries', 'too-many-countries', 'array-param'])(
        'accepts the real 422 body for %s',
        name => {
            const { status, body } = fixture(name);
            expect(status).toBe(422);
            const parsed = ValidationErrorSchema.parse(body);
            expect(typeof parsed.message).toBe('string');
            expect(Object.keys(parsed.errors).length).toBeGreaterThan(0);
        }
    );
});
