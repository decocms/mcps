# Meta Ads MCP  

Complete MCP for managing and analyzing Meta/Facebook Ads campaigns.

## Features

This MCP provides comprehensive tools to **create, manage, and analyze** your Meta (Facebook/Instagram) advertising campaigns:

- **Create campaigns** with objectives, budgets, and scheduling
- **Create ad sets** with targeting, optimization, and bidding
- **Create ads** with creatives and call-to-actions (use existing posts or links)
- **Update/pause/delete** campaigns, ad sets, and ads
- **View performance** metrics with breakdowns by age, gender, country, device, etc.
- **Compare performance** between periods
- **Analyze ROI and costs** at different levels

## Available Tools

### Accounts - User Token Tools (3 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_USER_INFO` | Get authenticated user information (User Token only) |
| `META_ADS_GET_USER_AD_ACCOUNTS` | List accessible ad accounts (User Token only) |
| `META_ADS_GET_USER_ACCOUNT_PAGES` | Pages associated with the user (User Token only) |

### Accounts - Page Token Tools (3 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_PAGE_INFO` | Get current page information (Page Token only) |
| `META_ADS_GET_PAGE_AD_ACCOUNTS` | List ad accounts associated with the page (Page Token only) |
| `META_ADS_GET_PAGE_ACCOUNT_PAGES` | Get current page details (Page Token only) |

### Accounts - Universal Tools (1 tool)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_ACCOUNT_INFO` | Account details (currency, timezone, status) - works with both token types |

### Campaigns (5 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_CAMPAIGNS` | List campaigns with status filter |
| `META_ADS_GET_CAMPAIGN_DETAILS` | Details of a specific campaign |
| `META_ADS_CREATE_CAMPAIGN` | Create a new campaign with objective, budget, and schedule |
| `META_ADS_UPDATE_CAMPAIGN` | Update/pause/activate a campaign |
| `META_ADS_DELETE_CAMPAIGN` | Delete a campaign |

### Ad Sets (5 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_ADSETS` | List ad sets with campaign filter |
| `META_ADS_GET_ADSET_DETAILS` | Ad set details (targeting, budget) |
| `META_ADS_CREATE_ADSET` | Create ad set with targeting, budget, and optimization |
| `META_ADS_UPDATE_ADSET` | Update/pause/activate an ad set |
| `META_ADS_DELETE_ADSET` | Delete an ad set |

### Ads (5 tools)
| Tool | Description |
|------|-------------|
| `META_ADS_GET_ADS` | List ads with ad set filter |
| `META_ADS_GET_AD_DETAILS` | Ad details |
| `META_ADS_GET_AD_CREATIVES` | Get creative details for an ad |
| `META_ADS_CREATE_AD` | Create a new ad with a creative |
| `META_ADS_UPDATE_AD` | Update/pause/activate an ad |
| `META_ADS_DELETE_AD` | Delete an ad |

### Creatives (1 tool)
| Tool | Description |
|------|-------------|
| `META_ADS_CREATE_AD_CREATIVE` | Create a creative with text and CTA (use existing posts or link ads) |

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

This MCP uses an Access Token for authentication with the Meta Graph API.

### Configuration Fields

When installing the MCP, you'll need to provide:

| Field | Required | Description |
|-------|----------|-------------|
| `META_APP_ID` | Yes | Your Meta App ID from [developers.facebook.com/apps](https://developers.facebook.com/apps/) |
| `META_APP_SECRET` | Yes | Your Meta App Secret from App Settings > Basic |
| `META_ACCESS_TOKEN` | Yes | Access Token from Graph API Explorer |

### Automatic Token Exchange 🔄

**The MCP automatically exchanges short-lived tokens for long-lived tokens!**

When you provide your App ID and App Secret:
1. Short-lived tokens (~1 hour) are automatically exchanged for long-lived tokens (~60 days)
2. The exchange happens transparently on first API call
3. Long-lived tokens are cached for the session

This means you can paste a fresh token from Graph API Explorer and it will be automatically extended to ~60 days.

### How to Get Your Credentials

#### Step 1: Get App ID and App Secret
1. Go to [Meta for Developers](https://developers.facebook.com/apps/)
2. Create a new app or select an existing one
3. Go to **Settings > Basic**
4. Copy your **App ID** and **App Secret**

#### Step 2: Get Access Token
1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your App from the dropdown
3. Click "Generate Access Token"
4. Grant the required permissions
5. Copy the generated token

### Required Permissions

When generating your token, grant these permissions:

- `ads_read` - Read ad information (required)
- `ads_management` - Manage ads (required for some operations)
- `pages_read_engagement` - Read associated pages
- `business_management` - Access business accounts

### Token Types Supported

**Two types of tokens are supported:**
- **User Access Token**: Access all ad accounts and pages for a user
- **Page Access Token**: Access ad accounts and data for a specific page

Use the appropriate tools:
- **User Token**: Use `META_ADS_GET_USER_*` tools
- **Page Token**: Use `META_ADS_GET_PAGE_*` tools
- **Both**: Universal tools like `META_ADS_GET_INSIGHTS` work with either token type

### Token Duration

| Token Type | Duration |
|------------|----------|
| Short-lived (from Graph Explorer) | ~1 hour |
| Long-lived (after automatic exchange) | ~60 days |

> ⚠️ **Important**: Long-lived tokens expire after ~60 days. You'll need to generate a new token and update the configuration when this happens.

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

## Creating a Complete Campaign

To create a full campaign from scratch, follow this flow:

```
1. Create Campaign
   -> META_ADS_CREATE_CAMPAIGN(account_id, name, objective, ...)

2. Create Ad Set with targeting
   -> META_ADS_CREATE_ADSET(account_id, campaign_id, targeting, ...)

3. Create Ad Creative (use existing post or link ad)
   -> META_ADS_CREATE_AD_CREATIVE(account_id, page_id, link, ...)
   OR
   -> META_ADS_CREATE_AD_CREATIVE(account_id, effective_object_story_id, ...)

4. Create Ad
   -> META_ADS_CREATE_AD(account_id, adset_id, creative_id, ...)

5. Activate (when ready)
   -> META_ADS_UPDATE_CAMPAIGN(campaign_id, status: "ACTIVE")
```

### Campaign Objectives

| Objective | Use Case |
|-----------|----------|
| `OUTCOME_TRAFFIC` | Drive website visits |
| `OUTCOME_ENGAGEMENT` | Get likes, comments, shares |
| `OUTCOME_LEADS` | Collect leads via forms |
| `OUTCOME_SALES` | Drive purchases/conversions |
| `OUTCOME_AWARENESS` | Reach and brand awareness |
| `OUTCOME_APP_PROMOTION` | App installs |

## Usage Examples

### Reading Data

```
1. "List my ad accounts" 
   -> META_ADS_GET_USER_AD_ACCOUNTS

2. "Show active campaigns for account act_123" 
   -> META_ADS_GET_CAMPAIGNS(account_id: "act_123", status_filter: "ACTIVE")

3. "How is campaign X performing in the last 7 days?"
   -> META_ADS_GET_INSIGHTS(object_id: "campaign_id", date_preset: "last_7d")

4. "Compare results by age and gender" 
   -> META_ADS_GET_INSIGHTS(object_id: "campaign_id", breakdowns: ["age", "gender"])

5. "Which ads have the best CTR?"
   -> META_ADS_GET_ADS + META_ADS_GET_INSIGHTS for each
```

### Creating Campaigns

```
1. "Create a traffic campaign for my website"
   -> META_ADS_CREATE_CAMPAIGN(
        account_id: "act_123",
        name: "Website Traffic Q1",
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED"
      )

2. "Create an ad set targeting 25-45 year olds in Brazil"
   -> META_ADS_CREATE_ADSET(
        account_id: "act_123",
        campaign_id: "123456",
        name: "Brazil Adults",
        targeting: {
          age_min: 25,
          age_max: 45,
          geo_locations: { countries: ["BR"] }
        },
        optimization_goal: "LINK_CLICKS",
        billing_event: "IMPRESSIONS",
        daily_budget: "5000"
      )

3. "Create a creative with link and text"
   -> META_ADS_CREATE_AD_CREATIVE(
        account_id: "act_123",
        page_id: "page_123",
        link: "https://mysite.com",
        message: "Check out our amazing products!",
        headline: "Limited Time Offer",
        call_to_action_type: "SHOP_NOW"
      )

4. "Create an ad using the creative"
   -> META_ADS_CREATE_AD(
        account_id: "act_123",
        adset_id: "adset_456",
        name: "Shop Now Ad",
        creative_id: "creative_789"
      )
```

### Managing Campaigns

```
1. "Pause campaign X"
   -> META_ADS_UPDATE_CAMPAIGN(campaign_id: "123", status: "PAUSED")

2. "Increase daily budget to $100"
   -> META_ADS_UPDATE_ADSET(adset_id: "456", daily_budget: "10000")

3. "Activate my ad"
   -> META_ADS_UPDATE_AD(ad_id: "789", status: "ACTIVE")

4. "Delete old campaign"
   -> META_ADS_DELETE_CAMPAIGN(campaign_id: "123")
```
