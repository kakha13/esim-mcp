import type { Plan } from './schemas.js';

export interface TripComparison {
    singlePlan: Plan | null;
    localStack: { plans: Plan[]; missing: string[] } | null;
    recommendation: 'single' | 'local' | 'none';
    singleTotalCents: number | null;
    localTotalCents: number | null;
    savingsCents: number | null;
}

/**
 * Compare exactly two ways to cover a trip.
 *
 * Option one is the cheapest single plan covering every requested country.
 * Option two is the cheapest local plan per country, summed.
 *
 * It deliberately does not search for an optimal combination of partially
 * overlapping regional plans. That is set cover: the answers are impossible
 * for a person to verify, and two clear options beat one clever one.
 */
export function compareTrip(plans: Plan[], countries: string[]): TripComparison {
    const wanted = countries.map(country => country.toUpperCase());

    const covers = (plan: Plan, country: string): boolean =>
        plan.covers_requested.some(iso => iso.toUpperCase() === country);

    const cheapest = (candidates: Plan[]): Plan | null =>
        candidates.reduce<Plan | null>(
            (best, candidate) => (best === null || candidate.price_cents < best.price_cents ? candidate : best),
            null
        );

    const singlePlan = cheapest(plans.filter(plan => wanted.every(country => covers(plan, country))));

    const perCountry: Plan[] = [];
    const missing: string[] = [];
    for (const country of wanted) {
        const best = cheapest(plans.filter(plan => covers(plan, country)));
        if (best === null) {
            missing.push(country);
        } else if (!perCountry.some(chosen => chosen.id === best.id)) {
            perCountry.push(best);
        }
    }

    const localStack = perCountry.length > 0 ? { plans: perCountry, missing } : null;

    const singleTotalCents = singlePlan?.price_cents ?? null;
    const localTotalCents = localStack
        ? localStack.plans.reduce((total, plan) => total + plan.price_cents, 0)
        : null;

    let recommendation: TripComparison['recommendation'] = 'none';
    if (singleTotalCents !== null && localTotalCents !== null) {
        // A tie goes to the single plan: one eSIM to install beats two.
        recommendation = singleTotalCents <= localTotalCents ? 'single' : 'local';
    } else if (singleTotalCents !== null) {
        recommendation = 'single';
    } else if (localTotalCents !== null) {
        recommendation = 'local';
    }

    const savingsCents =
        singleTotalCents !== null && localTotalCents !== null
            ? Math.abs(singleTotalCents - localTotalCents)
            : null;

    return { singlePlan, localStack, recommendation, singleTotalCents, localTotalCents, savingsCents };
}
