# Google Search Console MCP 

MCP Server for Google Search Console integration. Access search analytics, manage sitemaps, inspect URLs, and monitor site performance using the Google Search Console API.

## Features

### Search Analytics
- **query_search_analytics** - Query search analytics data (clicks, impressions, CTR, position) with filters by date, query, page, country, device, and search type

### Sites Management
- **list_sites** - List all sites in Google Search Console
- **get_site** - Get information about a specific site
- **add_site** - Add a new site to Google Search Console
- **remove_site** - Remove a site from Google Search Console

### Sitemaps Management
- **list_sitemaps** - List all sitemaps for a site
- **get_sitemap** - Get information about a specific sitemap
- **submit_sitemap** - Submit a sitemap to Google Search Console
- **delete_sitemap** - Delete a sitemap from Google Search Console

### URL Inspection
- **inspect_url** - Inspect a URL's Google index status, including indexing state, mobile usability, AMP status, and rich results

## Setup

### 1. Create Project in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Google Search Console API**:
   - Sidebar → APIs & Services → Library
   - Search for "Google Search Console API" and enable it

### 2. Configure OAuth 2.0

1. Go to "APIs & Services" → "Credentials"
2. Click "Create credentials" → "OAuth client ID"
3. Select "Web application"
4. Configure:
   - Name: Google Search Console MCP
   - Authorized JavaScript origins: your URL
   - Authorized redirect URIs: your callback URL

### 3. Configure Environment Variables

Create a `.env` file in the `google-search-console/` directory:

```bash
cd google-search-console
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
```

**Important:** The `.env` file must be in the `google-search-console/` directory (not the monorepo root). Bun automatically loads `.env` files when running `bun run dev`.

**Troubleshooting:** If you get "OAuth client was not found" error, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## Development

```bash
# Install dependencies (from monorepo root)
bun install

# Run in development (hot reload)
cd google-search-console
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## Usage Examples

### Query Search Analytics

```json
{
  "tool": "query_search_analytics",
  "input": {
    "siteUrl": "sc-domain:example.com",
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "dimensions": ["query", "page"],
    "rowLimit": 100
  }
}
```

### List Sitemaps

```json
{
  "tool": "list_sitemaps",
  "input": {
    "siteUrl": "sc-domain:example.com"
  }
}
```

### Inspect URL

```json
{
  "tool": "inspect_url",
  "input": {
    "siteUrl": "sc-domain:example.com",
    "inspectionUrl": "https://example.com/page"
  }
}
```

### Submit Sitemap

```json
{
  "tool": "submit_sitemap",
  "input": {
    "siteUrl": "sc-domain:example.com",
    "feedpath": "https://example.com/sitemap.xml"
  }
}
```

## Site URL Format

Google Search Console uses different site URL formats:

- **Domain property**: `sc-domain:example.com` (includes all subdomains)
- **URL prefix property**: `https://example.com/` (specific protocol and path)
- **Subdomain**: `https://www.example.com/` (specific subdomain)

## API Limits

- Search Analytics queries are limited to the last 16 months of data
- Maximum 25,000 rows per query
- URL Inspection has rate limits (check Google's documentation)

## References

- [Google Search Console API Documentation](https://developers.google.com/webmaster-tools/v1/getting-started)
- [Search Analytics API Reference](https://developers.google.com/webmaster-tools/v1/searchanalytics)
- [URL Inspection API Reference](https://developers.google.com/webmaster-tools/v1/urlInspection.index)
