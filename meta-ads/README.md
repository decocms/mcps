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

This MCP uses direct access token authentication with the Meta Graph API. You need to provide your Facebook access token to use this MCP.

### Getting Your Access Token

You can obtain a Facebook access token in several ways:

1. **Facebook Graph API Explorer** (Recommended for testing):
   - Go to https://developers.facebook.com/tools/explorer/
   - Select your app (or create one at https://developers.facebook.com/apps/)
   - Click "Generate Access Token"
   - Select the required permissions:
     - `ads_read` - Read ad information
     - `ads_management` - Manage ads (required for some operations)
     - `pages_read_engagement` - Read associated pages
     - `business_management` - Access business accounts
   - Copy the generated token

2. **Facebook App Dashboard**:
   - Go to https://developers.facebook.com/apps/
   - Select your app
   - Navigate to Tools > Graph API Explorer
   - Generate a token with the required permissions

3. **Long-lived Token** (Recommended for production):
   - Generate a short-lived token using the Graph API Explorer
   - Exchange it for a long-lived token (60 days) using:
     ```
     GET https://graph.facebook.com/v21.0/oauth/access_token?
       grant_type=fb_exchange_token&
       client_id={app-id}&
       client_secret={app-secret}&
       fb_exchange_token={short-lived-token}
     ```

### Configuration

Set the `META_ACCESS_TOKEN` environment variable with your Facebook access token:

- **Local development**: Add to `.dev.vars` file:
  ```
  META_ACCESS_TOKEN=your_token_here
  ```

- **Production**: Set as a secret in your deployment platform (Deco/GitHub Actions)

### Required Permissions

Your access token must have the following permissions:
- `ads_read` - Read ad information
- `ads_management` - Manage ads (required for some operations)
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
