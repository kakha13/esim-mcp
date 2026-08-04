export interface Config {
    apiBase: string;
    apiToken?: string;
    timeoutMs: number;
}

const DEFAULT_API_BASE = 'https://cheaperesim.com';
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Read configuration from the environment.
 *
 * Takes env explicitly so tests never mutate process.env. A trailing slash on
 * the base is stripped, because every path we join starts with one.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const timeout = Number(env.CHEAPERESIM_TIMEOUT_MS);

    return {
        apiBase: (env.CHEAPERESIM_API_BASE ?? DEFAULT_API_BASE).replace(/\/+$/, ''),
        apiToken: env.CHEAPERESIM_API_TOKEN || undefined,
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS
    };
}
