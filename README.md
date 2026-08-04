# esim-mcp

[![npm version](https://img.shields.io/npm/v/esim-mcp)](https://www.npmjs.com/package/esim-mcp)
[![npm downloads](https://img.shields.io/npm/dm/esim-mcp)](https://www.npmjs.com/package/esim-mcp)
[![CI](https://github.com/kakha13/esim-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kakha13/esim-mcp/actions/workflows/ci.yml)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.kakha13%2Fesim--mcp-blue)](https://registry.modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**An MCP server for travel eSIM plans.** It lets Claude, Cursor, and any other Model Context Protocol client search travel eSIM data plans by country, compare prices, and work out the cheapest way to stay connected across a multi-country trip.

Ask "what is the cheapest eSIM for two weeks in Japan and South Korea?" and get real plans with real prices, not a guess.

esim-mcp is built and maintained by [CheapereSIM](https://cheaperesim.com), and returns CheapereSIM pricing. It covers 190+ destinations across 8 regions.

## What you can ask

Once installed, these all work in plain language:

- "What is the cheapest eSIM for Japan?"
- "I am travelling to Japan, South Korea and Taiwan for three weeks. What should I buy?"
- "Is there a single eSIM that covers all of Southeast Asia?"
- "Which countries does that regional plan actually cover?"
- "Show me unlimited data eSIM plans for Turkey."
- "How much data is left on my eSIM?" (needs a token)

The interesting one is the multi-country case. A regional eSIM that covers your whole trip is sometimes cheaper than buying a local eSIM in each country, and sometimes it is not. `plan_trip` prices both and tells you which wins.

## Setup

Add this to your MCP client configuration:

```json
{
  "mcpServers": {
    "esim": {
      "command": "npx",
      "args": ["-y", "esim-mcp"]
    }
  }
}
```

No API key, no account, and no configuration are required to search destinations and compare plans. Set `CHEAPERESIM_API_TOKEN` only if you also want the two account tools.

## Example: planning a multi-country trip

Asking `plan_trip` for three weeks across Japan, South Korea and Taiwan, with at least 10GB:

```
Option 1 - one plan covering everything, $34.58:
Asia (12 areas) 10GB 30Days: 10 GB for 30 days - $34.58 - covers 12 countries
  https://cheaperesim.com/multi-country-esim?package=2488&utm_source=mcp&utm_medium=ai&utm_campaign=esim-mcp

Option 2 - one local plan per country, $17.52 total:
Japan 10GB 30Days: 10 GB for 30 days - $8.76
  https://cheaperesim.com/esim/japan?package=339&utm_source=mcp&utm_medium=ai&utm_campaign=esim-mcp
South Korea 10GB 30Days: 10 GB for 30 days - $8.76
  https://cheaperesim.com/esim/south-korea?package=345&utm_source=mcp&utm_medium=ai&utm_campaign=esim-mcp
No local plan available for: TW.

Recommended: option 1, since option 2 does not cover: TW.
```

That is real output against live pricing, not an illustration. It is also the case worth understanding: buying local is half the price, and it is still the wrong answer, because Taiwan is sold only inside regional plans. A price comparison that stopped at the cheaper number would leave you without service for a third of the trip.

The server prints each `buy_url` exactly as the API returns it, so the links above are the ones you would get.

## Tools

| Tool | Description | Requires token |
|---|---|---|
| `search_destinations` | Find countries CheapereSIM sells eSIM plans for, by full or partial name. | No |
| `list_plans` | List eSIM plans for one country, cheapest first. | No |
| `plan_trip` | Work out the cheapest way to stay connected across several countries. | No |
| `get_plan_coverage` | List every country a regional or global plan covers. | No |
| `list_popular_destinations` | List the destinations travellers buy eSIMs for most often. | No |
| `list_my_esims` | List the eSIMs on the configured CheapereSIM account. | Yes |
| `get_esim_usage` | Show how much data is left on one eSIM. | Yes |

`list_my_esims` and `get_esim_usage` are only registered when `CHEAPERESIM_API_TOKEN` is set. Without a token, the server exposes the first five tools only, so a model never sees a tool it cannot call.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CHEAPERESIM_API_BASE` | `https://cheaperesim.com` | Base URL of the CheapereSIM API |
| `CHEAPERESIM_API_TOKEN` | unset | API token for the two account tools; omit to run in read-only lookup mode |
| `CHEAPERESIM_TIMEOUT_MS` | `10000` | Request timeout in milliseconds |

Keep `CHEAPERESIM_API_BASE` on `https`. The token is sent as a bearer header, so an `http` override would put it on the wire in cleartext.

## Getting a token

Create a token at [cheaperesim.com/dashboard/api-tokens](https://cheaperesim.com/dashboard/api-tokens). Tokens are read-only: they can list your eSIMs and their usage, but they cannot buy a plan, change your profile, or delete your account. Treat one like a password and revoke it if it leaks.

## FAQ

**What is an eSIM?**
A digital SIM your phone downloads instead of a plastic card you swap in. Most phones sold since about 2018 support one, so you can buy mobile data for a country before you land and skip roaming charges.

**Which countries can I search?**
190+ destinations across Europe, Asia, North and South America, Africa, Oceania and the Middle East, plus regional and global plans that span many countries at once. Use `search_destinations` to check a specific one.

**Does this cost anything to install?**
No. The server and the five lookup tools are free and need no account. You only pay if you decide to buy a plan on cheaperesim.com.

**Is a regional eSIM cheaper than buying one per country?**
It depends on the trip, which is the whole reason `plan_trip` exists. For two neighbouring countries a pair of local plans often wins; across four or five, a regional plan usually does. The tool prices both and shows the difference.

**Does it work with anything other than Claude?**
Yes. It speaks the Model Context Protocol over stdio, so any MCP client can run it, including Cursor and custom agents built on the MCP SDKs.

**Can it buy a plan for me?**
No, by design. Every tool is read-only. Plans come back with a link, and the purchase happens in your browser on cheaperesim.com.

## Development

```bash
npm install
npm test
npm run build
```

`npm run typecheck` type-checks the tests as well as the source. CI runs the build, the typecheck, and the suite on Node 20 and 22.

## License

MIT. See [LICENSE](LICENSE).
