import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    DestinationSearchResponseSchema,
    OrdersResponseSchema,
    PlanSearchResponseSchema,
    PopularResponseSchema,
    UsageResponseSchema,
    ValidationErrorSchema
} from '../src/schemas.js';

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

/**
 * Only plans/search is a versioned public commitment. The account and
 * destination endpoints are ordinary inline controller arrays, free to change,
 * so requiring a field nobody reads turns a harmless rename into "CheapereSIM
 * returned data in an unexpected shape" for every published install.
 */
describe('unfrozen endpoint schemas tolerate fields the tools never read', () => {
    const order = {
        uuid: 'abc-123', status: 'delivered', package_name: 'Japan 5GB', destination: 'Japan',
        destination_flag: null, destination_iso_code: 'JP', delivered_at: null, expires_at: null,
        installed_at: null, activated_at: null, smdp_status: 'RELEASED', data_used_bytes: 1,
        data_total_bytes: 2, last_synced_at: null, created_at: '2026-01-01T00:00:00+00:00'
    };
    const orders = { data: [order], current_page: 1, last_page: 1, total: 1 };

    const destination = {
        id: 1, name: 'Japan', slug: 'japan', iso_code: 'JP', region: 'Asia',
        flag_emoji: null, from_price: '$1.06', plan_label: '100MB 7 days'
    };

    const popular = {
        id: 1, name: 'Japan', slug: 'japan', iso_code: 'JP', region: 'Asia', flag_emoji: null,
        is_popular: true, cheapest_price_cents: 106, package_count: 102, cheapest_plan_label: '100MB'
    };

    const usage = {
        usage: {
            data_used_mb: 1024, data_remaining_mb: 4096, data_used_formatted: '1 GB',
            data_remaining_formatted: '4 GB', is_active: true, usage_percent: 20,
            last_checked_at: '2026-01-05T00:00:00+00:00'
        }
    };

    const without = <T extends object>(source: T, key: keyof T): T => {
        const copy = { ...source };
        delete copy[key];
        return copy;
    };

    it.each([
        ['orders row field', () => OrdersResponseSchema.parse({ ...orders, data: [without(order, 'created_at')] })],
        ['orders envelope field', () => OrdersResponseSchema.parse(without(orders, 'current_page'))],
        ['destination field', () => DestinationSearchResponseSchema.parse({ destinations: [without(destination, 'slug')] })],
        ['popular field', () => PopularResponseSchema.parse({ destinations: [without(popular, 'is_popular')] })],
        ['usage field', () => UsageResponseSchema.parse({ usage: without(usage.usage, 'data_used_mb') })]
    ])('parses a response missing an unread %s', (_label, parse) => {
        expect(parse).not.toThrow();
    });

    it.each([
        ['orders row field', () => OrdersResponseSchema.parse({ ...orders, data: [without(order, 'uuid')] })],
        ['orders envelope field', () => OrdersResponseSchema.parse(without(orders, 'total'))],
        ['destination field', () => DestinationSearchResponseSchema.parse({ destinations: [without(destination, 'name')] })],
        ['popular field', () => PopularResponseSchema.parse({ destinations: [without(popular, 'package_count')] })],
        ['usage field', () => UsageResponseSchema.parse({ usage: without(usage.usage, 'data_remaining_formatted') })]
    ])('still rejects a response missing a consumed %s', (_label, parse) => {
        expect(parse).toThrow();
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
