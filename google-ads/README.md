# Google Ads MCP

MCP (Model Context Protocol) server for Google Ads API v18. Manage campaigns, ad groups, ads, keywords, and get performance reports.

## Features

- **Account Management**: List accessible customers, get customer details
- **Campaign Management**: List, create, update, pause, and enable campaigns
- **Ad Group Management**: List, create, update, pause, and enable ad groups
- **Ad Management**: List, create responsive search ads, pause, and enable ads
- **Keyword Management**: List, create, update, pause, enable, and remove keywords (including negative keywords)
- **Performance Reports**: Account, campaign, ad group, and keyword performance metrics

## Authentication

This MCP uses OAuth 2.0 with PKCE for authentication. Users will be redirected to Google to authorize access to their Google Ads accounts.

### Required OAuth Scope

```
https://www.googleapis.com/auth/adwords
```

### Environment Variables

```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

## Tools

### Account Tools

| Tool | Description |
|------|-------------|
| `list_accessible_customers` | List all Google Ads customer accounts accessible by the authenticated user |
| `get_customer` | Get detailed information about a specific customer account |

### Campaign Tools

| Tool | Description |
|------|-------------|
| `list_campaigns` | List all campaigns for a customer account (optionally filter by status) |
| `get_campaign` | Get detailed information about a specific campaign |
| `create_campaign` | Create a new campaign with budget |
| `update_campaign` | Update campaign settings (name, dates, network settings) |
| `pause_campaign` | Pause a campaign |
| `enable_campaign` | Enable a campaign |

### Ad Group Tools

| Tool | Description |
|------|-------------|
| `list_ad_groups` | List ad groups (optionally filter by campaign) |
| `get_ad_group` | Get detailed information about a specific ad group |
| `create_ad_group` | Create a new ad group in a campaign |
| `update_ad_group` | Update ad group settings (name, bids) |
| `pause_ad_group` | Pause an ad group |
| `enable_ad_group` | Enable an ad group |

### Ad Tools

| Tool | Description |
|------|-------------|
| `list_ads` | List ads (optionally filter by ad group) |
| `get_ad` | Get detailed information about a specific ad |
| `create_responsive_search_ad` | Create a new Responsive Search Ad (RSA) |
| `pause_ad` | Pause an ad |
| `enable_ad` | Enable an ad |

### Keyword Tools

| Tool | Description |
|------|-------------|
| `list_keywords` | List keywords (optionally filter by ad group) |
| `get_keyword` | Get detailed information about a specific keyword |
| `create_keyword` | Add a new keyword to an ad group |
| `create_negative_keyword` | Add a negative keyword to block certain searches |
| `update_keyword` | Update keyword settings (status, bid, URLs) |
| `pause_keyword` | Pause a keyword |
| `enable_keyword` | Enable a keyword |
| `remove_keyword` | Permanently remove a keyword |

### Report Tools

| Tool | Description |
|------|-------------|
| `get_account_performance` | Get overall account performance metrics |
| `get_campaign_performance` | Get campaign performance with daily breakdown |
| `get_ad_group_performance` | Get ad group performance metrics |
| `get_keyword_performance` | Get keyword performance metrics |

## Usage Examples

### List accessible customers

```json
{
  "tool": "list_accessible_customers",
  "input": {}
}
```

### Create a Search campaign

```json
{
  "tool": "create_campaign",
  "input": {
    "customerId": "1234567890",
    "name": "My Search Campaign",
    "advertisingChannelType": "SEARCH",
    "budgetAmountMicros": "10000000",
    "status": "PAUSED",
    "targetGoogleSearch": true,
    "targetSearchNetwork": true
  }
}
```

### Create an ad group

```json
{
  "tool": "create_ad_group",
  "input": {
    "customerId": "1234567890",
    "campaignResourceName": "customers/1234567890/campaigns/9876543210",
    "name": "Brand Keywords",
    "cpcBidMicros": "1000000"
  }
}
```

### Create a Responsive Search Ad

```json
{
  "tool": "create_responsive_search_ad",
  "input": {
    "customerId": "1234567890",
    "adGroupResourceName": "customers/1234567890/adGroups/1111111111",
    "finalUrls": ["https://example.com/landing-page"],
    "headlines": [
      "Buy Running Shoes",
      "Free Shipping Available",
      "Top Brands on Sale"
    ],
    "descriptions": [
      "Shop our wide selection of running shoes. Free returns.",
      "Get the best deals on athletic footwear. Order now!"
    ],
    "path1": "shoes",
    "path2": "running"
  }
}
```

### Add a keyword

```json
{
  "tool": "create_keyword",
  "input": {
    "customerId": "1234567890",
    "adGroupResourceName": "customers/1234567890/adGroups/1111111111",
    "text": "running shoes",
    "matchType": "PHRASE",
    "cpcBidMicros": "500000"
  }
}
```

### Get campaign performance

```json
{
  "tool": "get_campaign_performance",
  "input": {
    "customerId": "1234567890",
    "dateRange": "LAST_30_DAYS"
  }
}
```

## Date Range Presets

For reports, you can use the following date range presets:

- `TODAY`
- `YESTERDAY`
- `LAST_7_DAYS`
- `LAST_14_DAYS`
- `LAST_30_DAYS`
- `LAST_90_DAYS`
- `THIS_WEEK_SUN_TODAY`
- `THIS_WEEK_MON_TODAY`
- `LAST_WEEK_SUN_SAT`
- `LAST_WEEK_MON_SUN`
- `THIS_MONTH`
- `LAST_MONTH`
- `ALL_TIME`

## Money Values

All monetary values in Google Ads API are in **micros** (1/1,000,000 of the currency unit):

- $1.00 = 1,000,000 micros
- $0.50 = 500,000 micros
- $10.00 = 10,000,000 micros

## Resource Names

Google Ads uses resource names to identify entities:

- Customer: `customers/1234567890`
- Campaign: `customers/1234567890/campaigns/9876543210`
- Campaign Budget: `customers/1234567890/campaignBudgets/1111111111`
- Ad Group: `customers/1234567890/adGroups/2222222222`
- Ad Group Ad: `customers/1234567890/adGroupAds/2222222222~3333333333`
- Ad Group Criterion (Keyword): `customers/1234567890/adGroupCriteria/2222222222~4444444444`

## Development

### Install dependencies

```bash
bun install
```

### Run locally

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Type check

```bash
bun run check
```

## License

MIT

