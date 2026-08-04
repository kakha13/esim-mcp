import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/server.js';
import { ApiError, CheapereSIMClient } from '../src/client.js';

async function connect(client: Partial<CheapereSIMClient>) {
    const server = buildServer(client as CheapereSIMClient);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);
    return mcpClient;
}

describe('buildServer', () => {
    it('registers the lookup tools and no account tools without a token', async () => {
        const mcp = await connect({});
        const names = (await mcp.listTools()).tools.map(t => t.name).sort();

        expect(names).toEqual([
            'get_plan_coverage',
            'list_plans',
            'list_popular_destinations',
            'plan_trip',
            'search_destinations'
        ]);
        expect(names).not.toContain('list_my_esims');
        expect(names).not.toContain('get_esim_usage');
    });

    it('search_destinations returns matches as text and structured content', async () => {
        const mcp = await connect({
            searchDestinations: vi.fn(async () => ({
                destinations: [
                    { id: 13, name: 'Japan', slug: 'japan', iso_code: 'JP', region: 'Asia', flag_emoji: null, from_price: '$1.06', plan_label: '100MB / 7d' }
                ]
            }))
        });

        const result = await mcp.callTool({ name: 'search_destinations', arguments: { query: 'jap' } });

        expect(result.isError).toBeFalsy();
        expect(JSON.stringify(result.content)).toContain('Japan');
        expect((result.structuredContent as { destinations: unknown[] }).destinations).toHaveLength(1);
    });

    it('list_plans passes filters through to the client', async () => {
        const searchPlans = vi.fn(async () => ({ plans: [], unmatched: [] }));
        const mcp = await connect({ searchPlans });

        await mcp.callTool({ name: 'list_plans', arguments: { country: 'JP', days: 14, min_data_gb: 5 } });

        expect(searchPlans).toHaveBeenCalledWith({ countries: ['JP'], days: 14, minDataGb: 5, limit: 20 });
    });

    it('reports an unmatched country instead of pretending it found nothing', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => ({ plans: [], unmatched: ['Narnia'] }))
        });

        const result = await mcp.callTool({ name: 'list_plans', arguments: { country: 'Narnia' } });

        expect(JSON.stringify(result.content)).toContain('Narnia');
        expect(JSON.stringify(result.content)).toContain('not');
    });

    it('turns a client ApiError into an isError result rather than throwing', async () => {
        const mcp = await connect({
            searchPlans: vi.fn(async () => {
                throw new ApiError('rate_limited', 'Too many requests to CheapereSIM. Wait a minute and try again.');
            })
        });

        const result = await mcp.callTool({ name: 'list_plans', arguments: { country: 'JP' } });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('Wait a minute');
    });

    it('survives an unexpected non-ApiError throw', async () => {
        const mcp = await connect({
            getPopular: vi.fn(async () => {
                throw new TypeError('boom');
            })
        });

        const result = await mcp.callTool({ name: 'list_popular_destinations', arguments: {} });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).not.toContain('boom');
        expect(JSON.stringify(result.content)).toContain('Something went wrong talking to CheapereSIM');
    });
});
