import {
    CoverageResponseSchema,
    DestinationSearchResponseSchema,
    OrdersResponseSchema,
    PlanSearchResponseSchema,
    PopularResponseSchema,
    UsageResponseSchema,
    ValidationErrorSchema,
    type Coverage,
    type OrdersResponse,
    type PlanSearchResponse,
    type UsageResponse
} from './schemas.js';
import type { Config } from './config.js';

export type ApiErrorKind =
    | 'timeout'
    | 'network'
    | 'validation'
    | 'not_found'
    | 'rate_limited'
    | 'unauthorized'
    | 'server'
    | 'malformed';

/**
 * Every failure the client can produce, already phrased for a person.
 *
 * userMessage is what a tool surfaces. It never contains the API token, and
 * never contains a raw stack trace.
 */
export class ApiError extends Error {
    constructor(
        public readonly kind: ApiErrorKind,
        public readonly userMessage: string
    ) {
        super(userMessage);
        this.name = 'ApiError';
    }
}

export interface PlanSearchParams {
    countries: string[];
    days?: number;
    minDataGb?: number;
    scope?: 'local' | 'regional' | 'global';
    limit?: number;
}

export class CheapereSIMClient {
    constructor(
        private readonly config: Config,
        private readonly fetchImpl: typeof fetch = fetch
    ) {}

    searchPlans(params: PlanSearchParams): Promise<PlanSearchResponse> {
        const query = new URLSearchParams({ countries: params.countries.join(',') });
        if (params.days !== undefined) {
            query.set('days', String(params.days));
        }
        if (params.minDataGb !== undefined) {
            query.set('min_data_gb', String(params.minDataGb));
        }
        if (params.scope !== undefined) {
            query.set('scope', params.scope);
        }
        if (params.limit !== undefined) {
            query.set('limit', String(params.limit));
        }

        return this.get(`/api/v1/plans/search?${query}`, PlanSearchResponseSchema);
    }

    getCoverage(groupId: number): Promise<Coverage> {
        return this.get(`/api/v1/plans/${groupId}/coverage`, CoverageResponseSchema);
    }

    searchDestinations(query: string) {
        return this.get(`/api/v1/search?q=${encodeURIComponent(query)}`, DestinationSearchResponseSchema);
    }

    getPopular() {
        return this.get('/api/v1/popular', PopularResponseSchema);
    }

    listOrders(): Promise<OrdersResponse> {
        return this.get('/api/v1/orders', OrdersResponseSchema, true);
    }

    getUsage(uuid: string): Promise<UsageResponse> {
        return this.get(`/api/v1/orders/${encodeURIComponent(uuid)}/usage`, UsageResponseSchema, true);
    }

    /**
     * One request, one place where every failure mode is mapped.
     *
     * The token is attached only when authenticated is true, so a public call
     * can never leak it to a logging proxy.
     */
    private async get<T>(
        path: string,
        schema: { parse: (input: unknown) => T },
        authenticated = false
    ): Promise<T> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const headers: Record<string, string> = { Accept: 'application/json' };
        if (authenticated && this.config.apiToken) {
            headers.Authorization = `Bearer ${this.config.apiToken}`;
        }

        let response: Response;
        try {
            response = await this.fetchImpl(`${this.config.apiBase}${path}`, {
                headers,
                signal: controller.signal
            });
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ApiError(
                    'timeout',
                    `CheapereSIM did not respond within ${this.config.timeoutMs}ms. Try again in a moment.`
                );
            }
            throw new ApiError('network', 'Could not reach CheapereSIM. Check your connection and try again.');
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            throw await this.toError(response);
        }

        let body: unknown;
        try {
            body = await response.json();
        } catch {
            throw new ApiError('malformed', 'CheapereSIM returned a response that was not valid JSON.');
        }

        try {
            return schema.parse(body);
        } catch {
            throw new ApiError(
                'malformed',
                'CheapereSIM returned data in an unexpected shape. The server may have been updated; try upgrading esim-mcp.'
            );
        }
    }

    private async toError(response: Response): Promise<ApiError> {
        let body: unknown = null;
        try {
            body = await response.json();
        } catch {
            body = null;
        }

        if (response.status === 422) {
            const parsed = ValidationErrorSchema.safeParse(body);
            const detail = parsed.success
                ? Object.values(parsed.data.errors).flat().join(' ')
                : 'The request was rejected as invalid.';
            return new ApiError('validation', detail);
        }

        switch (response.status) {
            case 401:
            case 403:
                return new ApiError(
                    'unauthorized',
                    'Your CheapereSIM API token was rejected. Create a new one at https://cheaperesim.com/dashboard/api-tokens and set CHEAPERESIM_API_TOKEN.'
                );
            case 404:
                return new ApiError('not_found', 'CheapereSIM has no record matching that request.');
            case 429:
                return new ApiError('rate_limited', 'Too many requests to CheapereSIM. Wait a minute and try again.');
            default:
                return new ApiError('server', `CheapereSIM returned an error (HTTP ${response.status}). Try again shortly.`);
        }
    }
}
