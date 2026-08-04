import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/server.js';
import { ApiError, type CheapereSIMClient } from '../src/client.js';

async function connect(client: Partial<CheapereSIMClient>, hasToken: boolean) {
    const server = buildServer(client as CheapereSIMClient, { hasToken });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const mcp = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([mcp.connect(a), server.connect(b)]);
    return mcp;
}

describe('account tools', () => {
    it('are absent entirely without a token', async () => {
        const mcp = await connect({}, false);
        const names = (await mcp.listTools()).tools.map(t => t.name);

        expect(names).not.toContain('list_my_esims');
        expect(names).not.toContain('get_esim_usage');
    });

    it('are registered with a token', async () => {
        const mcp = await connect({}, true);
        const names = (await mcp.listTools()).tools.map(t => t.name);

        expect(names).toContain('list_my_esims');
        expect(names).toContain('get_esim_usage');
    });

    it('lists eSIMs without claiming the list price is what was paid', async () => {
        const mcp = await connect(
            {
                listOrders: vi.fn(async () => ({
                    data: [
                        {
                            uuid: 'abc-123', status: 'delivered', package_name: 'Japan 5GB 30 Days',
                            destination: 'Japan', destination_flag: null, destination_iso_code: 'JP',
                            delivered_at: '2026-01-01T00:00:00+00:00', expires_at: '2026-02-01T00:00:00+00:00',
                            activated_at: null, smdp_status: 'RELEASED', data_used_bytes: 1073741824,
                            data_total_bytes: 5368709120, last_synced_at: null, created_at: '2026-01-01T00:00:00+00:00'
                        }
                    ],
                    current_page: 1, last_page: 1, total: 1
                }))
            },
            true
        );

        const result = await mcp.callTool({ name: 'list_my_esims', arguments: {} });
        const text = JSON.stringify(result.content);

        expect(text).toContain('Japan');
        expect(text).toContain('abc-123');
        expect(text.toLowerCase()).not.toContain('you paid');
    });

    it('says so plainly when the account has no eSIMs', async () => {
        const mcp = await connect(
            { listOrders: vi.fn(async () => ({ data: [], current_page: 1, last_page: 1, total: 0 })) },
            true
        );

        const result = await mcp.callTool({ name: 'list_my_esims', arguments: {} });

        expect(JSON.stringify(result.content).toLowerCase()).toContain('no esims');
    });

    it('explains a rejected token rather than showing a raw 401', async () => {
        const mcp = await connect(
            {
                listOrders: vi.fn(async () => {
                    throw new ApiError('unauthorized', 'Your CheapereSIM API token was rejected. Create a new one at https://cheaperesim.com/dashboard/api-tokens and set CHEAPERESIM_API_TOKEN.');
                })
            },
            true
        );

        const result = await mcp.callTool({ name: 'list_my_esims', arguments: {} });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('dashboard/api-tokens');
    });

    it('reports usage that is not available yet without inventing numbers', async () => {
        const mcp = await connect(
            { getUsage: vi.fn(async () => ({ message: 'Usage data is not available for this order.', usage: null })) },
            true
        );

        const result = await mcp.callTool({ name: 'get_esim_usage', arguments: { order_uuid: 'abc-123' } });

        expect(JSON.stringify(result.content)).toContain('not available');
        expect(result.isError).toBeFalsy();
    });

    it('reports real usage figures', async () => {
        const mcp = await connect(
            {
                getUsage: vi.fn(async () => ({
                    usage: {
                        data_used_mb: 1024, data_remaining_mb: 4096,
                        data_used_formatted: '1 GB', data_remaining_formatted: '4 GB',
                        is_active: true, usage_percent: 20, last_checked_at: '2026-01-05T00:00:00+00:00'
                    }
                }))
            },
            true
        );

        const result = await mcp.callTool({ name: 'get_esim_usage', arguments: { order_uuid: 'abc-123' } });
        const text = JSON.stringify(result.content);

        expect(text).toContain('4 GB');
        expect(text).toContain('20');
    });
});
