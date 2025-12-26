# Meta Ads Analytics MCP  

MCP for performance analysis of Meta/Facebook Ads campaigns.

## Features

This MCP provides tools to analyze the performance of your Meta (Facebook/Instagram) advertising campaigns:

- **View performance** of campaigns, ad sets, and ads
- **Get detailed metrics** with breakdowns by age, gender, country, device, etc.
- **Compare performance** between periods
- **Analyze ROI and costs** at different levels

## Available Tools

### Accounts (3 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_AD_ACCOUNTS` | List accessible ad accounts |
| `META_ADS_GET_ACCOUNT_INFO` | Account details (currency, timezone, status) |
| `META_ADS_GET_ACCOUNT_PAGES` | Pages associated with the account |

### Campaigns (2 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_CAMPAIGNS` | List campaigns with status filter |
| `META_ADS_GET_CAMPAIGN_DETAILS` | Details of a specific campaign |

### Ad Sets (2 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_ADSETS` | List ad sets with campaign filter |
| `META_ADS_GET_ADSET_DETAILS` | Ad set details (targeting, budget) |

### Ads (3 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_ADS` | List ads with ad set filter |
| `META_ADS_GET_AD_DETAILS` | Ad details |
| `META_ADS_GET_AD_CREATIVES` | Ad creatives |

### Insights (1 tool)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_INSIGHTS` | Performance metrics with breakdowns |

## Insights Metrics

The `META_ADS_GET_INSIGHTS` tool returns metrics such as:

- **Performance**: impressions, reach, clicks, ctr, cpc, cpm
- **Conversions**: conversions, cost_per_conversion
- **Costs**: spend, cost_per_unique_click

**Available breakdowns**: age, gender, country, device_platform, publisher_platform

## Authentication

This MCP uses OAuth PKCE for authentication with the Meta Graph API. The user will be redirected to authorize access to the ad account.

### Required Permissions

- `ads_read` - Read ad information
- `pages_read_engagement` - Read associated pages
- `business_management` - Access business accounts

## Development

```bash
# Install dependencies
bun install

# Local development
bun run dev

# Build
bun run build

# Deploy
bun run publish
```

## Usage Examples

```
1. "List my ad accounts" 
   -> META_ADS_GET_AD_ACCOUNTS

2. "Show active campaigns for account act_123" 
   -> META_ADS_GET_CAMPAIGNS(account_id: "act_123", status_filter: "ACTIVE")

3. "How is campaign X performing in the last 7 days?"
   -> META_ADS_GET_INSIGHTS(object_id: "campaign_id", date_preset: "last_7d")

4. "Compare results by age and gender" 
   -> META_ADS_GET_INSIGHTS(object_id: "campaign_id", breakdowns: ["age", "gender"])

5. "Which ads have the best CTR?"
   -> META_ADS_GET_ADS + META_ADS_GET_INSIGHTS for each
```
