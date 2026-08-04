# esim-mcp

An MCP server for travel eSIM plan discovery. It searches destinations, lists and compares eSIM plans, works out the cheapest way to cover a multi-country trip, and checks coverage for regional and global plans.

esim-mcp is built and maintained by CheapereSIM, and returns CheapereSIM pricing.

## Setup

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

No configuration is required to search plans and destinations. Set `CHEAPERESIM_API_TOKEN` to also enable the two account tools.

## Example: planning a trip

Asking `plan_trip` to cover Japan and South Korea:

```
Option 1 - no single plan covers every country on this trip.

Option 2 - one local plan per country, $2.12 total:
Japan 100MB 7Days: 100 MB for 7 days - $1.06
  http://localhost/esim/japan?package=4471&utm_source=mcp&utm_medium=ai&utm_campaign=esim-mcp
South Korea 100MB 7Days: 100 MB for 7 days - $1.06
  http://localhost/esim/south-korea?package=4479&utm_source=mcp&utm_medium=ai&utm_campaign=esim-mcp

Recommended: option 2.
```

This transcript came from a captured API response with only small local plans available, so no single regional plan could win the comparison. Larger destinations typically also have a regional or global plan that `plan_trip` weighs against the local stack.

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

`list_my_esims` and `get_esim_usage` are only registered when `CHEAPERESIM_API_TOKEN` is set. Without a token, the server exposes the first five tools only.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CHEAPERESIM_API_BASE` | `https://cheaperesim.com` | Base URL of the CheapereSIM API |
| `CHEAPERESIM_API_TOKEN` | unset | API token for the two account tools; omit to run in read-only lookup mode |
| `CHEAPERESIM_TIMEOUT_MS` | `10000` | Request timeout in milliseconds |

## Getting a token

Create a token at [cheaperesim.com/dashboard/api-tokens](https://cheaperesim.com/dashboard/api-tokens). Tokens are read-only: they can list your eSIMs and their usage, but they cannot buy a plan, change your profile, or delete your account.

## Development

```bash
npm install
npm test
npm run build
```
