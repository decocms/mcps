# Google Analytics MCP

MCP Server for Google Analytics 4 (GA4) integration. Analyze website traffic, user behavior, and performance metrics using the Google Analytics Data API with OAuth authentication.

## Features

### Property Management
- **ga_list_properties** - List all GA4 properties you have access to
- **ga_get_property** - Get detailed information about a specific property
- **ga_list_data_streams** - List data streams (websites, apps) for a property

### Reporting & Analytics
- **ga_run_report** - Run custom reports with dimensions, metrics, and date ranges
- **ga_run_realtime_report** - Get real-time analytics (last 30 minutes of activity)
- **ga_get_common_report** - Get pre-configured reports (overview, traffic sources, page performance, etc.)

## Setup

### 1. Create Project in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Google Analytics Data API** and **Google Analytics Admin API**:
   - Sidebar → APIs & Services → Library
   - Search for "Google Analytics Data API" and enable it
   - Search for "Google Analytics Admin API" and enable it

### 2. Configure OAuth 2.0

1. Go to "APIs & Services" → "Credentials"
2. Click "Create credentials" → "OAuth client ID"
3. Select "Web application"
4. Configure:
   - Name: Google Analytics MCP
   - Authorized JavaScript origins: your URL
   - Authorized redirect URIs: your callback URL

### 3. Configure Environment Variables

Create a `.env` file with:

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

### 4. Grant Analytics Access

Make sure the authenticated Google account has access to the Google Analytics properties you want to query. The account needs at least "Viewer" role in Google Analytics.

## Development

```bash
# Install dependencies (from monorepo root)
bun install

# Run in development (hot reload)
cd google-analytics
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## Usage Examples

### List Available Properties

```json
{
  "tool": "ga_list_properties",
  "input": {}
}
```

### Get Property Details

```json
{
  "tool": "ga_get_property",
  "input": {
    "propertyId": "123456789"
  }
}
```

### Get Daily Active Users (Last 7 Days)

```json
{
  "tool": "ga_run_report",
  "input": {
    "propertyId": "123456789",
    "dateRanges": [
      {
        "startDate": "7daysAgo",
        "endDate": "today"
      }
    ],
    "dimensions": ["date"],
    "metrics": ["activeUsers", "sessions", "screenPageViews"],
    "orderBys": [
      {
        "dimension": {
          "dimensionName": "date"
        }
      }
    ]
  }
}
```

### Get Top Pages by Views

```json
{
  "tool": "ga_run_report",
  "input": {
    "propertyId": "123456789",
    "dateRanges": [
      {
        "startDate": "30daysAgo",
        "endDate": "today"
      }
    ],
    "dimensions": ["pagePath", "pageTitle"],
    "metrics": ["screenPageViews", "activeUsers"],
    "orderBys": [
      {
        "metric": {
          "metricName": "screenPageViews"
        },
        "desc": true
      }
    ],
    "limit": 10
  }
}
```

### Get Traffic by Source and Medium

```json
{
  "tool": "ga_run_report",
  "input": {
    "propertyId": "123456789",
    "dateRanges": [
      {
        "startDate": "30daysAgo",
        "endDate": "today"
      }
    ],
    "dimensions": ["sessionSource", "sessionMedium"],
    "metrics": ["sessions", "activeUsers", "engagementRate"],
    "orderBys": [
      {
        "metric": {
          "metricName": "sessions"
        },
        "desc": true
      }
    ],
    "limit": 20
  }
}
```

### Get Traffic by Country

```json
{
  "tool": "ga_run_report",
  "input": {
    "propertyId": "123456789",
    "dateRanges": [
      {
        "startDate": "7daysAgo",
        "endDate": "today"
      }
    ],
    "dimensions": ["country", "city"],
    "metrics": ["activeUsers", "sessions"],
    "orderBys": [
      {
        "metric": {
          "metricName": "activeUsers"
        },
        "desc": true
      }
    ],
    "limit": 15
  }
}
```

### Get Traffic by Device

```json
{
  "tool": "ga_run_report",
  "input": {
    "propertyId": "123456789",
    "dateRanges": [
      {
        "startDate": "30daysAgo",
        "endDate": "today"
      }
    ],
    "dimensions": ["deviceCategory", "browser"],
    "metrics": ["activeUsers", "sessions", "engagementRate"],
    "orderBys": [
      {
        "metric": {
          "metricName": "activeUsers"
        },
        "desc": true
      }
    ]
  }
}
```

### Get Realtime Active Users

```json
{
  "tool": "ga_run_realtime_report",
  "input": {
    "propertyId": "123456789",
    "dimensions": ["country", "city", "pagePath"],
    "metrics": ["activeUsers"],
    "limit": 20,
    "orderBys": [
      {
        "metric": {
          "metricName": "activeUsers"
        },
        "desc": true
      }
    ]
  }
}
```

### Get Pre-configured Overview Report

```json
{
  "tool": "ga_get_common_report",
  "input": {
    "propertyId": "123456789",
    "reportType": "overview",
    "dateRange": "last7days",
    "limit": 50
  }
}
```

Available report types:
- `overview` - High-level summary (users, sessions, engagement)
- `traffic_sources` - Traffic by source, medium, campaign
- `page_performance` - Top pages by views and engagement
- `geo` - Traffic by country and city
- `devices` - Users by device, browser, OS
- `events` - Top events and conversions
- `realtime` - Current active users

## Common Dimensions

| Dimension | Description |
|-----------|-------------|
| `date` | Date in YYYYMMDD format |
| `country` | Country name |
| `city` | City name |
| `deviceCategory` | Device type (desktop, mobile, tablet) |
| `browser` | Browser name |
| `operatingSystem` | Operating system |
| `pagePath` | Page URL path |
| `pageTitle` | Page title |
| `source` | Traffic source |
| `medium` | Traffic medium |
| `campaignName` | Campaign name |
| `sessionSource` | Session source |
| `sessionMedium` | Session medium |
| `eventName` | Event name |
| `language` | Language |
| `hostname` | Website hostname |

## Common Metrics

| Metric | Description |
|--------|-------------|
| `activeUsers` | Number of active users |
| `newUsers` | Number of new users |
| `totalUsers` | Total users |
| `sessions` | Number of sessions |
| `engagedSessions` | Number of engaged sessions |
| `averageSessionDuration` | Average session duration (seconds) |
| `sessionsPerUser` | Average sessions per user |
| `screenPageViews` | Number of page views |
| `screenPageViewsPerSession` | Average page views per session |
| `eventCount` | Number of events |
| `conversions` | Number of conversions |
| `totalRevenue` | Total revenue |
| `engagementRate` | Engagement rate (%) |
| `bounceRate` | Bounce rate (%) |
| `userEngagementDuration` | Total engagement duration |

## Date Range Formats

You can use absolute or relative dates:

**Relative dates:**
- `today` - Today
- `yesterday` - Yesterday
- `7daysAgo` - 7 days ago
- `30daysAgo` - 30 days ago
- `90daysAgo` - 90 days ago

**Absolute dates:**
- Use `YYYY-MM-DD` format (e.g., `2024-01-01`)

## Project Structure

```
google-analytics/
├── server/
│   ├── main.ts              # Entry point with OAuth
│   ├── constants.ts         # API URLs and constants
│   ├── lib/
│   │   ├── analytics-client.ts  # API client
│   │   ├── types.ts         # TypeScript types
│   │   └── env.ts           # Access token helper
│   └── tools/
│       ├── index.ts         # Exports all tools
│       ├── properties.ts    # Property management tools
│       └── reports.ts       # Reporting tools
├── shared/
│   └── deco.gen.ts          # Generated types
├── app.json                 # MCP configuration
├── package.json
├── tsconfig.json
└── README.md
```

## OAuth Scopes

This MCP requests the following scopes:

- `https://www.googleapis.com/auth/analytics.readonly` - Read analytics data
- `https://www.googleapis.com/auth/analytics` - View and manage analytics data

## Troubleshooting

### "Property not found" error

Make sure:
1. The property ID is correct (numeric ID without "properties/" prefix)
2. Your Google account has access to the property in Google Analytics
3. You've authenticated with the correct Google account

### "Insufficient permissions" error

Your Google account needs at least "Viewer" role in Google Analytics for the property you're trying to access.

### Empty results

- Check if your property has data for the date range you specified
- Try using a wider date range (e.g., last 30 days instead of today)
- Verify the property is collecting data (check in Google Analytics web interface)

## API Limits

Google Analytics Data API has the following quotas (per property):

- **Tokens per day:** 25,000 (for standard properties)
- **Tokens per hour:** 5,000
- **Concurrent requests:** 10

Each API request consumes tokens based on complexity. Monitor your quota usage in the API response (`propertyQuota` field).

## Resources

- [Google Analytics Data API Documentation](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [GA4 Dimensions & Metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [Google Analytics Help](https://support.google.com/analytics)

## License

MIT
