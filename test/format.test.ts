import { describe, it, expect } from 'vitest';
import { formatData, formatPrice } from '../src/format.js';
import type { Plan } from '../src/schemas.js';

function plan(over: Partial<Plan>): Plan {
    return {
        id: 1, group_id: null, name: 'Plan', scope: 'local',
        data_amount_mb: 5120, data_gb: 5, is_unlimited: false, duration_days: 30,
        price_cents: 1000, price_formatted: '$10.00', currency: 'USD',
        price_per_gb_cents: 200, provider: 'eSIM Access', destination_count: 1,
        covers_requested: ['JP'], covers_all_requested: false,
        buy_url: 'https://cheaperesim.com/esim/japan?package=1',
        ...over
    };
}

describe('formatData', () => {
    it('says Unlimited for an unlimited plan regardless of its byte count', () => {
        expect(formatData(plan({ is_unlimited: true, data_amount_mb: 0 }))).toBe('Unlimited');
    });

    it('uses GB above a gigabyte and MB below it', () => {
        expect(formatData(plan({ data_amount_mb: 5120, data_gb: 5 }))).toBe('5 GB');
        expect(formatData(plan({ data_amount_mb: 500, data_gb: 0.5 }))).toBe('500 MB');
    });

    it('keeps one decimal place only when it carries information', () => {
        expect(formatData(plan({ data_amount_mb: 1536, data_gb: 1.5 }))).toBe('1.5 GB');
        expect(formatData(plan({ data_amount_mb: 2048, data_gb: 2 }))).toBe('2 GB');
    });
});

describe('formatPrice', () => {
    it('renders whole and fractional dollars', () => {
        expect(formatPrice(2450)).toBe('$24.50');
        expect(formatPrice(500)).toBe('$5.00');
        expect(formatPrice(0)).toBe('$0.00');
    });

    it('falls back to a currency-suffixed form for anything but USD', () => {
        expect(formatPrice(2450, 'EUR')).toBe('24.50 EUR');
    });
});
