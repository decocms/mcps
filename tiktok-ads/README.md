# TikTok Ads MCP

MCP Server for TikTok Marketing API integration. Manage campaigns, ad groups, ads and analyze performance using the TikTok Business API.

## Features

### Campaign Management
- **list_campaigns** - List all campaigns with filters
- **get_campaign** - Get details of a specific campaign
- **create_campaign** - Create a new campaign
- **update_campaign** - Update existing campaign

### Ad Group Management
- **list_adgroups** - List ad groups with filters
- **get_adgroup** - Get details of a specific ad group
- **create_adgroup** - Create a new ad group
- **update_adgroup** - Update existing ad group

### Ad Management
- **list_ads** - List ads with filters
- **get_ad** - Get details of a specific ad
- **create_ad** - Create a new ad
- **update_ad** - Update existing ad

### Reports & Analytics
- **get_report** - Get custom performance reports
- **get_campaign_report** - Get campaign performance metrics
- **get_adgroup_report** - Get ad group performance metrics
- **get_ad_report** - Get ad performance metrics
- **get_advertiser_info** - Get advertiser account information

## Setup

### 1. Create App in TikTok for Business

1. Go to [TikTok for Business Developer Portal](https://business-api.tiktok.com/portal/apps/)
2. Create a new app or use an existing one
3. Request the following permissions:
   - `ad.operation.read` - Read campaigns, ad groups, and ads
   - `ad.operation.write` - Create and modify campaigns
   - `report.read` - Access performance reports

### 2. Get Access Token

1. In the TikTok Developer Portal, go to your app
2. Navigate to "Tools" > "Access Token"
3. Generate a long-lived access token
4. Copy the token

> **Nota:** O token direto funciona sem precisar de aprovação do app pelo TikTok. É ideal para desenvolvimento e produção inicial.

### 3. Configure na Instalação do MCP

Ao instalar o MCP, você será solicitado a preencher:

- **Access Token**: O token gerado no passo anterior

## Development

```bash
# Install dependencies (from monorepo root)
bun install

# Run in development (hot reload)
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## Usage Examples

### List all campaigns

```json
{
  "tool": "list_campaigns",
  "input": {
    "advertiser_id": "123456789"
  }
}
```

### Create a new campaign

```json
{
  "tool": "create_campaign",
  "input": {
    "advertiser_id": "123456789",
    "campaign_name": "Summer Sale 2024",
    "objective_type": "WEB_CONVERSIONS",
    "budget_mode": "BUDGET_MODE_DAY",
    "budget": 100
  }
}
```

### Create an ad group

```json
{
  "tool": "create_adgroup",
  "input": {
    "advertiser_id": "123456789",
    "campaign_id": "987654321",
    "adgroup_name": "US Adults 25-45",
    "optimization_goal": "CONVERT",
    "placements": ["PLACEMENT_TIKTOK"],
    "budget_mode": "BUDGET_MODE_DAY",
    "budget": 50,
    "location_ids": ["6252001"],
    "gender": "GENDER_UNLIMITED",
    "age_groups": ["AGE_25_34", "AGE_35_44"]
  }
}
```

### Create an ad

```json
{
  "tool": "create_ad",
  "input": {
    "advertiser_id": "123456789",
    "adgroup_id": "111222333",
    "ad_name": "Summer Sale Video",
    "ad_format": "SINGLE_VIDEO",
    "ad_text": "Shop our summer collection! 🌴",
    "call_to_action": "Shop Now",
    "landing_page_url": "https://example.com/summer-sale",
    "video_id": "v123456789"
  }
}
```

### Get campaign performance report

```json
{
  "tool": "get_campaign_report",
  "input": {
    "advertiser_id": "123456789",
    "start_date": "2024-01-01",
    "end_date": "2024-01-31"
  }
}
```

### Get custom report with specific metrics

```json
{
  "tool": "get_report",
  "input": {
    "advertiser_id": "123456789",
    "data_level": "AUCTION_AD",
    "start_date": "2024-01-01",
    "end_date": "2024-01-07",
    "dimensions": ["ad_id", "stat_time_day"],
    "metrics": ["spend", "impressions", "clicks", "ctr", "video_play_actions", "likes", "shares"]
  }
}
```

### Update campaign status

```json
{
  "tool": "update_campaign",
  "input": {
    "advertiser_id": "123456789",
    "campaign_id": "987654321",
    "operation_status": "DISABLE"
  }
}
```

## Project Structure

```
tiktok-ads/
├── server/
│   ├── main.ts              # Entry point com StateSchema
│   ├── constants.ts         # API URLs and constants
│   ├── lib/
│   │   ├── tiktok-client.ts # API client
│   │   ├── types.ts         # TypeScript types
│   │   └── env.ts           # Helper para obter access token do state
│   └── tools/
│       ├── index.ts         # Exports all tools
│       ├── campaigns.ts     # Campaign tools
│       ├── adgroups.ts      # Ad Group tools
│       ├── ads.ts           # Ad tools
│       └── reports.ts       # Report tools
├── shared/
│   └── deco.gen.ts          # Types e StateSchema
├── app.json                 # MCP configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Campaign Objectives

| Objective | Description |
|-----------|-------------|
| TRAFFIC | Drive traffic to your website |
| APP_PROMOTION | Promote app installs and engagement |
| WEB_CONVERSIONS | Drive website conversions |
| PRODUCT_SALES | Sell products from a catalog |
| REACH | Maximize reach to your audience |
| VIDEO_VIEWS | Get more video views |
| LEAD_GENERATION | Collect leads from forms |
| COMMUNITY_INTERACTION | Increase profile engagement |

## Optimization Goals

| Goal | Description |
|------|-------------|
| CLICK | Optimize for clicks |
| CONVERT | Optimize for conversions |
| SHOW | Optimize for impressions |
| REACH | Optimize for unique reach |
| VIDEO_VIEW | Optimize for video views |
| LEAD_GENERATION | Optimize for lead form submissions |
| ENGAGEMENT | Optimize for profile engagement |

## Report Metrics

Common metrics available in reports:

- **spend** - Total amount spent
- **impressions** - Number of ad impressions
- **clicks** - Number of clicks
- **ctr** - Click-through rate
- **cpc** - Cost per click
- **cpm** - Cost per 1000 impressions
- **reach** - Number of unique users reached
- **frequency** - Average times ad shown per user
- **conversion** - Number of conversions
- **cost_per_conversion** - Cost per conversion
- **video_play_actions** - Video play actions
- **video_watched_2s** - 2-second video views
- **video_watched_6s** - 6-second video views
- **likes** - Number of likes
- **comments** - Number of comments
- **shares** - Number of shares
- **follows** - Number of new followers

## Authentication Notes

### Access Token Direto

Este MCP usa autenticação via Access Token direto, gerado no TikTok Developer Portal. Essa abordagem:

- ✅ **Funciona imediatamente** - Não precisa de aprovação do app pelo TikTok
- ✅ **Token de longa duração** - Expira em meses, não horas
- ✅ **Simples de configurar** - Basta gerar o token e colar na instalação

Para gerar o token:
1. Acesse [TikTok Developer Portal](https://business-api.tiktok.com/portal/apps/)
2. Vá em "Tools" > "Access Token"
3. Gere e copie o token

## API Reference

This MCP uses the TikTok Marketing API v1.3:
- Base URL: `https://business-api.tiktok.com/open_api/v1.3/`
- [Official Documentation](https://business-api.tiktok.com/marketing_api/docs)

## License

MIT

