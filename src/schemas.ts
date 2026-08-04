import { z } from 'zod';

/**
 * One purchasable plan, exactly as GET /api/v1/plans/search returns it.
 *
 * The API treats this shape as a frozen contract, so the schema is strict
 * about what must be present. price_per_gb_cents is null for unlimited plans
 * and for plans with no metered allowance; group_id is null for a local plan
 * that belongs to no provider package group.
 */
export const PlanSchema = z.object({
    id: z.number(),
    group_id: z.number().nullable(),
    name: z.string(),
    scope: z.enum(['local', 'regional', 'global']),
    data_amount_mb: z.number(),
    data_gb: z.number(),
    is_unlimited: z.boolean(),
    duration_days: z.number(),
    price_cents: z.number(),
    price_formatted: z.string(),
    currency: z.string(),
    price_per_gb_cents: z.number().nullable(),
    provider: z.string().nullable(),
    destination_count: z.number(),
    covers_requested: z.array(z.string()),
    covers_all_requested: z.boolean(),
    buy_url: z.string()
});

export const PlanSearchResponseSchema = z.object({
    plans: z.array(PlanSchema),
    unmatched: z.array(z.string())
});

export const CoverageResponseSchema = z.object({
    destination_count: z.number(),
    destinations: z.array(
        z.object({
            name: z.string(),
            slug: z.string(),
            iso_code: z.string().nullable(),
            flag_emoji: z.string().nullable()
        })
    )
});

/**
 * Everything below this line is an ordinary inline controller array, not the
 * versioned plans/search contract, so these endpoints are free to change shape.
 * Only the fields a tool actually reads or renders are required: demanding one
 * nobody consumes would turn a harmless rename into a hard parse failure for
 * every published install. Fields carried through untouched stay optional.
 */
export const DestinationSearchResponseSchema = z.object({
    destinations: z.array(
        z.object({
            id: z.number().optional(),
            name: z.string(),
            slug: z.string().optional(),
            iso_code: z.string().nullable(),
            region: z.string().nullable().optional(),
            flag_emoji: z.string().nullable().optional(),
            from_price: z.string().nullable(),
            plan_label: z.string().nullable().optional()
        })
    )
});

export const PopularResponseSchema = z.object({
    destinations: z.array(
        z.object({
            id: z.number().optional(),
            name: z.string(),
            slug: z.string().optional(),
            iso_code: z.string().nullable(),
            region: z.string().nullable().optional(),
            flag_emoji: z.string().nullable().optional(),
            is_popular: z.boolean().optional(),
            cheapest_price_cents: z.number().nullable(),
            package_count: z.number(),
            cheapest_plan_label: z.string().nullable().optional()
        })
    )
});

/** Laravel's 422 body. */
export const ValidationErrorSchema = z.object({
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string()))
});

/**
 * GET /api/v1/orders is a Laravel paginator, so the orders live under `data`.
 *
 * retail_price_cents is the LIST price, not what the customer was charged -
 * a promo code lives in a separate discount field the API does not expose
 * here. Never present it as "what you paid".
 */
export const OrdersResponseSchema = z.object({
    data: z.array(
        z.object({
            uuid: z.string(),
            status: z.string(),
            package_name: z.string().nullable(),
            destination: z.string().nullable(),
            destination_flag: z.string().nullable().optional(),
            destination_iso_code: z.string().nullable().optional(),
            delivered_at: z.string().nullable().optional(),
            expires_at: z.string().nullable(),
            installed_at: z.string().nullable().optional(),
            activated_at: z.string().nullable().optional(),
            smdp_status: z.string().nullable(),
            data_used_bytes: z.number().nullable(),
            data_total_bytes: z.number().nullable(),
            last_synced_at: z.string().nullable().optional(),
            created_at: z.string().optional()
        })
    ),
    current_page: z.number().optional(),
    last_page: z.number(),
    total: z.number()
});

/** Usage is null with an explanatory message when the eSIM is not yet delivered. */
export const UsageResponseSchema = z.object({
    message: z.string().optional(),
    usage: z
        .object({
            data_used_mb: z.number().nullable().optional(),
            data_remaining_mb: z.number().nullable().optional(),
            data_used_formatted: z.string().nullable(),
            data_remaining_formatted: z.string().nullable(),
            is_active: z.boolean().nullable(),
            usage_percent: z.number().nullable(),
            last_checked_at: z.string().nullable()
        })
        .nullable()
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanSearchResponse = z.infer<typeof PlanSearchResponseSchema>;
export type Coverage = z.infer<typeof CoverageResponseSchema>;
export type DestinationSearchResponse = z.infer<typeof DestinationSearchResponseSchema>;
export type PopularResponse = z.infer<typeof PopularResponseSchema>;
export type OrdersResponse = z.infer<typeof OrdersResponseSchema>;
export type UsageResponse = z.infer<typeof UsageResponseSchema>;
