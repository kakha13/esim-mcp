import { describe, it, expect, vi, afterEach } from 'vitest';
import { CheapereSIMClient, ApiError } from '../src/client.js';
import { loadConfig } from '../src/config.js';

function clientWith(fetchImpl: typeof fetch): CheapereSIMClient {
    return new CheapereSIMClient(
        { apiBase: 'https://example.test', timeoutMs: 1000 },
        fetchImpl
    );
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

afterEach(() => vi.restoreAllMocks());

describe('loadConfig', () => {
    it('defaults the api base and timeout', () => {
        const config = loadConfig({});
        expect(config.apiBase).toBe('https://cheaperesim.com');
        expect(config.timeoutMs).toBe(10000);
        expect(config.apiToken).toBeUndefined();
    });

    it('reads overrides from the environment and strips a trailing slash', () => {
        const config = loadConfig({
            CHEAPERESIM_API_BASE: 'http://localhost:8000/',
            CHEAPERESIM_API_TOKEN: 'secret',
            CHEAPERESIM_TIMEOUT_MS: '2500'
        });
        expect(config.apiBase).toBe('http://localhost:8000');
        expect(config.apiToken).toBe('secret');
        expect(config.timeoutMs).toBe(2500);
    });

    it('falls back to the default timeout when the value is not a positive number', () => {
        expect(loadConfig({ CHEAPERESIM_TIMEOUT_MS: 'soon' }).timeoutMs).toBe(10000);
        expect(loadConfig({ CHEAPERESIM_TIMEOUT_MS: '-5' }).timeoutMs).toBe(10000);
    });
});

describe('CheapereSIMClient', () => {
    it('builds the search query and returns validated plans', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            expect(String(url)).toBe(
                'https://example.test/api/v1/plans/search?countries=JP%2CKR&days=10&limit=5'
            );
            return jsonResponse({ plans: [], unmatched: [] });
        });
        const result = await clientWith(fetchMock as unknown as typeof fetch).searchPlans({
            countries: ['JP', 'KR'],
            days: 10,
            limit: 5
        });
        expect(result.plans).toEqual([]);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('turns a 422 into a validation ApiError carrying the field messages', async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse(
                { message: 'The selected scope is invalid.', errors: { scope: ['The selected scope is invalid.'] } },
                422
            )
        );
        const error = await clientWith(fetchMock as unknown as typeof fetch)
            .searchPlans({ countries: ['JP'] })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).kind).toBe('validation');
        expect((error as ApiError).userMessage).toContain('The selected scope is invalid.');
    });

    it('maps 404, 429, 401 and 500 to distinct kinds', async () => {
        const cases: Array<[number, string]> = [
            [404, 'not_found'],
            [429, 'rate_limited'],
            [401, 'unauthorized'],
            [500, 'server']
        ];
        for (const [status, kind] of cases) {
            const fetchMock = vi.fn(async () => jsonResponse({ message: 'nope' }, status));
            const error = await clientWith(fetchMock as unknown as typeof fetch)
                .getCoverage(1)
                .catch((e: unknown) => e);
            expect((error as ApiError).kind).toBe(kind);
        }
    });

    it('reports malformed json rather than leaking undefined', async () => {
        const fetchMock = vi.fn(
            async () => new Response('<html>502</html>', { status: 200, headers: { 'content-type': 'text/html' } })
        );
        const error = await clientWith(fetchMock as unknown as typeof fetch)
            .searchPlans({ countries: ['JP'] })
            .catch((e: unknown) => e);
        expect((error as ApiError).kind).toBe('malformed');
    });

    it('reports a response that does not match the contract as malformed', async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ plans: [{ id: 'not-a-number' }], unmatched: [] }));
        const error = await clientWith(fetchMock as unknown as typeof fetch)
            .searchPlans({ countries: ['JP'] })
            .catch((e: unknown) => e);
        expect((error as ApiError).kind).toBe('malformed');
    });

    it('times out and reports it', async () => {
        const fetchMock = vi.fn(
            (_url: string | URL, init?: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
                    });
                })
        );
        const client = new CheapereSIMClient(
            { apiBase: 'https://example.test', timeoutMs: 10 },
            fetchMock as unknown as typeof fetch
        );
        const error = await client.searchPlans({ countries: ['JP'] }).catch((e: unknown) => e);
        expect((error as ApiError).kind).toBe('timeout');
    });

    it('reports a plain fetch rejection as a network error', async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error('ECONNREFUSED');
        });
        const error = await clientWith(fetchMock as unknown as typeof fetch)
            .searchPlans({ countries: ['JP'] })
            .catch((e: unknown) => e);
        expect((error as ApiError).kind).toBe('network');
    });

    it('sends the bearer token on account calls and never on public ones', async () => {
        const seen: Array<Record<string, string>> = [];
        const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
            seen.push({ ...((init?.headers ?? {}) as Record<string, string>) });
            return jsonResponse({ data: [], current_page: 1, last_page: 1, total: 0 });
        });
        const client = new CheapereSIMClient(
            { apiBase: 'https://example.test', timeoutMs: 1000, apiToken: 'tok_123' },
            fetchMock as unknown as typeof fetch
        );
        await client.listOrders();
        expect(seen[0].Authorization).toBe('Bearer tok_123');

        const publicFetch = vi.fn(async (_url: string | URL, init?: RequestInit) => {
            expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
            return jsonResponse({ plans: [], unmatched: [] });
        });
        const publicClient = new CheapereSIMClient(
            { apiBase: 'https://example.test', timeoutMs: 1000, apiToken: 'tok_123' },
            publicFetch as unknown as typeof fetch
        );
        await publicClient.searchPlans({ countries: ['JP'] });
        expect(publicFetch).toHaveBeenCalledOnce();
    });

    it('never puts the token in the error message', async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ message: 'unauth' }, 401));
        const client = new CheapereSIMClient(
            { apiBase: 'https://example.test', timeoutMs: 1000, apiToken: 'tok_supersecret' },
            fetchMock as unknown as typeof fetch
        );
        const error = await client.listOrders().catch((e: unknown) => e);
        expect((error as ApiError).userMessage).not.toContain('tok_supersecret');
        expect((error as ApiError).message).not.toContain('tok_supersecret');
    });
});
