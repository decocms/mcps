/**
 * Google Analytics API constants and configuration
 */

export const ANALYTICS_API_BASE_V4 =
  "https://analyticsdata.googleapis.com/v1beta";
export const ANALYTICS_ADMIN_API_BASE =
  "https://analyticsadmin.googleapis.com/v1beta";

// Google Analytics Data API endpoints (GA4)
export const ENDPOINTS = {
  // Data API v1beta - Reports
  RUN_REPORT: (propertyId: string) =>
    `${ANALYTICS_API_BASE_V4}/properties/${propertyId}:runReport`,
  RUN_REALTIME_REPORT: (propertyId: string) =>
    `${ANALYTICS_API_BASE_V4}/properties/${propertyId}:runRealtimeReport`,
  BATCH_RUN_REPORTS: (propertyId: string) =>
    `${ANALYTICS_API_BASE_V4}/properties/${propertyId}:batchRunReports`,

  // Admin API - Properties
  PROPERTIES: `${ANALYTICS_ADMIN_API_BASE}/properties`,
  PROPERTY: (propertyId: string) =>
    `${ANALYTICS_ADMIN_API_BASE}/properties/${propertyId}`,

  // Admin API - Data Streams
  DATA_STREAMS: (propertyId: string) =>
    `${ANALYTICS_ADMIN_API_BASE}/properties/${propertyId}/dataStreams`,
  DATA_STREAM: (propertyId: string, streamId: string) =>
    `${ANALYTICS_ADMIN_API_BASE}/properties/${propertyId}/dataStreams/${streamId}`,
};

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  ANALYTICS_READONLY: "https://www.googleapis.com/auth/analytics.readonly",
  ANALYTICS: "https://www.googleapis.com/auth/analytics",
  ANALYTICS_EDIT: "https://www.googleapis.com/auth/analytics.edit",
} as const;

// Common dimensions
export const COMMON_DIMENSIONS = {
  DATE: "date",
  COUNTRY: "country",
  CITY: "city",
  DEVICE_CATEGORY: "deviceCategory",
  BROWSER: "browser",
  OPERATING_SYSTEM: "operatingSystem",
  PAGE_PATH: "pagePath",
  PAGE_TITLE: "pageTitle",
  SOURCE: "source",
  MEDIUM: "medium",
  CAMPAIGN_NAME: "campaignName",
  SESSION_SOURCE: "sessionSource",
  SESSION_MEDIUM: "sessionMedium",
  FIRST_USER_SOURCE: "firstUserSource",
  FIRST_USER_MEDIUM: "firstUserMedium",
  EVENT_NAME: "eventName",
  LANGUAGE: "language",
  SCREEN_RESOLUTION: "screenResolution",
  HOSTNAME: "hostName",
} as const;

// Common metrics
export const COMMON_METRICS = {
  ACTIVE_USERS: "activeUsers",
  NEW_USERS: "newUsers",
  TOTAL_USERS: "totalUsers",
  SESSIONS: "sessions",
  ENGAGED_SESSIONS: "engagedSessions",
  AVERAGE_SESSION_DURATION: "averageSessionDuration",
  SESSIONS_PER_USER: "sessionsPerUser",
  SCREEN_PAGE_VIEWS: "screenPageViews",
  SCREEN_PAGE_VIEWS_PER_SESSION: "screenPageViewsPerSession",
  EVENT_COUNT: "eventCount",
  CONVERSIONS: "conversions",
  TOTAL_REVENUE: "totalRevenue",
  ENGAGEMENT_RATE: "engagementRate",
  BOUNCE_RATE: "bounceRate",
  USER_ENGAGEMENT_DURATION: "userEngagementDuration",
} as const;

// Date ranges
export const DATE_RANGES = {
  TODAY: "today",
  YESTERDAY: "yesterday",
  LAST_7_DAYS: "7daysAgo",
  LAST_30_DAYS: "30daysAgo",
  LAST_90_DAYS: "90daysAgo",
  LAST_365_DAYS: "365daysAgo",
} as const;
