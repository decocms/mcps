export const SYSTEM_INSTRUCTIONS_PROMPT = `
This MCP server provides access to Microsoft Clarity analytics dashboard data, documentation resources and session recordings.

### 1. Session Recordings Tool: \`list-session-recordings\`
Lists Microsoft Clarity session recordings with metadata including session links, duration, and user interaction timelines.

**Parameters:**
- filters: Optional filters for sessions (date range, device type, etc.)
- sortBy: Sort option using SortOptions enum (default: SessionStart_DESC)
- count: Number of sessions to retrieve (1-250, default: 100)

**Sort Options:**
- SessionStart_DESC (newest first - default)
- SessionStart_ASC (oldest first)
- SessionDuration_ASC (shortest duration first)
- SessionDuration_DESC (longest duration first)
- SessionClickCount_ASC (fewest clicks first)
- SessionClickCount_DESC (most clicks first)
- PageCount_ASC (fewest pages first)
- PageCount_DESC (most pages first)

**Example Usage:**
- Get 10 newest sessions: { "count": 10, "sortBy": "SessionStart_DESC" }
- Get 20 longest sessions from date range: { "filters": { "date": { "start": "2024-01-01T00:00:00.000Z", "end": "2024-01-31T23:59:59.999Z" } }, "sortBy": "SessionDuration_DESC", "count": 20 }
- Get 15 mobile sessions with most clicks: { "filters": { "deviceType": ["Mobile"] }, "sortBy": "SessionClickCount_DESC", "count": 15 }
- Get oldest sessions first: { "sortBy": "SessionStart_ASC", "count": 100 }
- Get sessions with most page views: { "sortBy": "PageCount_DESC", "count": 100 }

### 2. Analytics Dashboard Tool: \`query-analytics-dashboard\`
This tool is your **primary and authoritative data source** for all dashboard-related insights and must be used to retrieve accurate, real-time data from the Microsoft Clarity dashboard.

#### Capabilities & Output
Microsoft Clarity dashboard provides comprehensive insights into the behavior and performance of the website, including:
- **User Analytics**: Unique and returning users, sessions, device types, browsers, operating systems
- **Geographic Data**: Countries, regions, traffic sources
- **Content Performance**: Popular pages, referrers, channels, campaigns, sources
- **User Behavior**: Smart events, scroll depth, click patterns
- **Technical Metrics**: JavaScript errors, URL performance
- **Performance Indicators**: Core Web Vitals
- **User Experience**: Quick backs, dead clicks, rage clicks, session duration

**IMPORTANT GUIDELINES:**
- Use SIMPLE, SINGLE-PURPOSE queries only
- Always specify time ranges, full URLs and parameters explicitly; prompt the user if not provided
- Break complex requests into multiple separate queries
- Focus on ONE trend or aggregated metric per query
- **LIMITS**: Each project allows 10 API requests per day, with a limit of 3 days' data and up to 3 dimensions per request.

**Good Examples:**
- "Page views count for the last 3 days"
- "Top javascript errors for PC in the last 2 days"
- "Top pages for mobile in the last 24 hours"

### 3. Documentation Tool: \`query-documentation-resources\`
Authoritative answers to Clarity setup, features, troubleshooting, and integrations. The tool covers topics including:
- Getting Started & Installation (Setup, Verification, Troubleshooting)
- Clarity for Mobile Apps (Android, iOS, SDKs)
- Dashboard & Insights (Overview, Features)
- Session Recordings & Heatmaps (Inline player, Click maps, Scroll maps)
- Filters & Segments (Exclusion filters, Regex)
- Settings & Management (Masking, IP blocking, Funnels)
- Copilot in Clarity (Overview, Chat, Insights)
- API Reference & Troubleshooting

**Best Practices:**
✅ Be specific about topics
✅ Focus on one specific question per query
✅ Use clear, actionable language
❌ Don't combine multiple unrelated topics
`;
