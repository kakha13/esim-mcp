#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CheapereSIMClient } from './client.js';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

/**
 * stdout is the JSON-RPC channel under stdio transport. Every diagnostic in
 * this process must go to stderr, or the client disconnects on a parse error.
 */
async function main(): Promise<void> {
    const config = loadConfig();
    const client = new CheapereSIMClient(config);
    const server = buildServer(client, { hasToken: config.apiToken !== undefined });

    await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
    console.error('esim-mcp failed to start:', error instanceof Error ? error.message : error);
    process.exit(1);
});
