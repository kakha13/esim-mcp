import type { Plan } from './schemas.js';

/** "Unlimited", "5 GB", "1.5 GB", or "500 MB". */
export function formatData(plan: Plan): string {
    if (plan.is_unlimited) {
        return 'Unlimited';
    }
    if (plan.data_amount_mb >= 1024) {
        const gb = plan.data_amount_mb / 1024;
        return `${Number(gb.toFixed(1))} GB`;
    }
    return `${plan.data_amount_mb} MB`;
}

/**
 * USD renders as $12.34 because that is what the site shows. Anything else
 * gets a suffix rather than a guessed symbol.
 */
export function formatPrice(cents: number, currency = 'USD'): string {
    const amount = (cents / 100).toFixed(2);
    return currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
}

/** One plan as a single readable line, with the buy link passed through untouched. */
export function formatPlanLine(plan: Plan): string {
    const parts = [
        `${plan.name}: ${formatData(plan)} for ${plan.duration_days} days`,
        formatPrice(plan.price_cents, plan.currency)
    ];
    if (plan.scope !== 'local') {
        parts.push(`covers ${plan.destination_count} countries`);
    }
    return `${parts.join(' - ')}\n  ${plan.buy_url}`;
}
