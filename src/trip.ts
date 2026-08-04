import type { Plan } from './schemas.js';

export interface TripComparison {
    singlePlan: Plan | null;
    localStack: { plans: Plan[]; missing: string[] };
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

    // Option two is a stack of *local* plans, one per country. Restricting the
    // search to scope === 'local' matters: a local plan covers exactly one
    // country, so the stack can never double-buy coverage a regional plan
    // already provides. A regional plan that covers everything is already
    // option one (singlePlan) - it never belongs in the local stack.
    const localPlans = plans.filter(plan => plan.scope === 'local');

    const perCountry: Plan[] = [];
    const missing: string[] = [];
    for (const country of wanted) {
        const best = cheapest(localPlans.filter(plan => covers(plan, country)));
        if (best === null) {
            missing.push(country);
        } else if (!perCountry.some(chosen => chosen.id === best.id)) {
            perCountry.push(best);
        }
    }

    // Always report the stack, even when it is empty: the missing list is the
    // useful part when no requested country has a local plan at all.
    const localStack = { plans: perCountry, missing };

    const singleTotalCents = singlePlan?.price_cents ?? null;
    const localTotalCents =
        localStack.plans.length > 0
            ? localStack.plans.reduce((total, plan) => total + plan.price_cents, 0)
            : null;

    // An incomplete local stack does not cover the trip, so it cannot win on
    // price against a plan that does. It only competes with singlePlan - and
    // savingsCents only makes sense - when both options are complete.
    const localComplete = missing.length === 0;

    let recommendation: TripComparison['recommendation'] = 'none';
    let savingsCents: number | null = null;
    if (singleTotalCents !== null && localTotalCents !== null && localComplete) {
        // A tie goes to the single plan: one eSIM to install beats two.
        recommendation = singleTotalCents <= localTotalCents ? 'single' : 'local';
        savingsCents = Math.abs(singleTotalCents - localTotalCents);
    } else if (singleTotalCents !== null) {
        // Either there is no local stack, or it cannot cover the whole trip.
        recommendation = 'single';
    } else if (localTotalCents !== null) {
        // No single plan exists; the (possibly incomplete) stack is all there is.
        recommendation = 'local';
    }

    return { singlePlan, localStack, recommendation, singleTotalCents, localTotalCents, savingsCents };
}
