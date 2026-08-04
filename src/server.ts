import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CheapereSIMClient } from './client.js';
import { registerSearchDestinations } from './tools/search-destinations.js';
import { registerListPlans } from './tools/list-plans.js';
import { registerListPopularDestinations } from './tools/list-popular-destinations.js';

export const SERVER_NAME = 'esim-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * Build the server with every tool registered.
 *
 * This is the only module a transport entry point imports, so the stdio and
 * future HTTP surfaces cannot drift apart.
 *
 * The two account tools are registered only when a token is configured. They
 * are absent rather than present-and-failing, so the model never sees a tool
 * it cannot use.
 */
export function buildServer(client: CheapereSIMClient, options: { hasToken?: boolean } = {}): McpServer {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

    registerSearchDestinations(server, client);
    registerListPlans(server, client);
    registerListPopularDestinations(server, client);

    if (options.hasToken) {
        // Account tools are registered in Task 5.
    }

    return server;
}
