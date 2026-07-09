/**
 * Zod output schemas for all GA4 API responses.
 *
 * Sources:
 *  - Data API:  https://developers.google.com/analytics/devguides/reporting/data/v1/rest
 *  - Admin API: https://developers.google.com/analytics/devguides/config/admin/v1/rest
 */

import { z } from "zod";

// ── Shared primitives ────────────────────────────────────────────────────────

/** ISO-8601 timestamp string (e.g. "2024-01-15T10:30:00Z"). */
const Timestamp = z.string();

/** Represents a date used in annotation. */
const DateSchema = z.object({
  year: z.number().int().optional(),
  month: z.number().int().optional(),
  day: z.number().int().optional(),
});

// ── Admin API — Account Summaries ────────────────────────────────────────────

export const PropertySummarySchema = z.object({
  /** Resource name, e.g. "properties/123456". */
  property: z.string(),
  displayName: z.string(),
  /** e.g. "PROPERTY_TYPE_ORDINARY" | "PROPERTY_TYPE_ROLLUP" | "PROPERTY_TYPE_SUBPROPERTY" */
  propertyType: z.string().optional(),
  /** Parent resource name, e.g. "accounts/123456". */
  parent: z.string().optional(),
  canEdit: z.boolean().optional(),
});

export const AccountSummarySchema = z.object({
  /** Resource name, e.g. "accountSummaries/123456". */
  name: z.string(),
  /** Account resource name, e.g. "accounts/123456". */
  account: z.string().optional(),
  displayName: z.string().optional(),
  propertySummaries: z.array(PropertySummarySchema).optional(),
});

export const AccountSummariesOutputSchema = z.object({
  accountSummaries: z.array(AccountSummarySchema).optional(),
});

// ── Admin API — Property ─────────────────────────────────────────────────────

export const PropertySchema = z.object({
  /** Resource name, e.g. "properties/123456". */
  name: z.string().optional(),
  /** Parent resource, e.g. "accounts/123456" or "properties/123" for sub-properties. */
  parent: z.string().optional(),
  createTime: Timestamp.optional(),
  updateTime: Timestamp.optional(),
  displayName: z.string().optional(),
  industryCategory: z.string().optional(),
  timeZone: z.string().optional(),
  currencyCode: z.string().optional(),
  /** e.g. "GOOGLE_ANALYTICS_STANDARD" | "GOOGLE_ANALYTICS_360" */
  serviceLevel: z.string().optional(),
  /** e.g. "PROPERTY_TYPE_ORDINARY" | "PROPERTY_TYPE_ROLLUP" | "PROPERTY_TYPE_SUBPROPERTY" */
  propertyType: z.string().optional(),
  account: z.string().optional(),
  deleteTime: Timestamp.optional(),
  expireTime: Timestamp.optional(),
});

// ── Admin API — Custom Dimensions & Metrics ──────────────────────────────────

export const CustomDimensionSchema = z.object({
  /** Resource name, e.g. "properties/123/customDimensions/456". */
  name: z.string().optional(),
  /** The parameter name used in events / user properties. */
  parameterName: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  /** "EVENT" | "USER" | "ITEM" */
  scope: z.string().optional(),
  disallowAdsPersonalization: z.boolean().optional(),
});

export const CustomMetricSchema = z.object({
  /** Resource name. */
  name: z.string().optional(),
  parameterName: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  /** e.g. "STANDARD" | "CURRENCY" | "FEET" | "METERS" | "KILOMETERS" | "MILES" | "MILLISECONDS" | "SECONDS" | "MINUTES" | "HOURS" */
  measurementUnit: z.string().optional(),
  /** "EVENT" | "ITEM" */
  scope: z.string().optional(),
  /** e.g. ["COST_DATA", "REVENUE_DATA"] */
  restrictedMetricType: z.array(z.string()).optional(),
});

export const CustomDimensionsAndMetricsOutputSchema = z.object({
  customDimensions: z.array(CustomDimensionSchema).optional(),
  customMetrics: z.array(CustomMetricSchema).optional(),
});

// ── Admin API — Google Ads Links ─────────────────────────────────────────────

export const GoogleAdsLinkSchema = z.object({
  /** Resource name. */
  name: z.string().optional(),
  /** Google Ads Customer ID (without hyphens). */
  customerId: z.string().optional(),
  canManageClients: z.boolean().optional(),
  adsPersonalizationEnabled: z.boolean().optional(),
  creatorEmailAddress: z.string().optional(),
  createTime: Timestamp.optional(),
  updateTime: Timestamp.optional(),
});

export const GoogleAdsLinksOutputSchema = z.object({
  googleAdsLinks: z.array(GoogleAdsLinkSchema).optional(),
});

// ── Admin API — Property Annotations ─────────────────────────────────────────

export const ReportingDataAnnotationSchema = z.object({
  /** Resource name. */
  name: z.string().optional(),
  annotationDate: DateSchema.optional(),
  annotationDateRange: z
    .object({
      startDate: DateSchema.optional(),
      endDate: DateSchema.optional(),
    })
    .optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  systemGenerated: z.boolean().optional(),
  /** "RED" | "ORANGE" | "YELLOW" | "GREEN" | "BLUE" | "PURPLE" | "PINK" */
  color: z.string().optional(),
});

export const PropertyAnnotationsOutputSchema = z.object({
  reportingDataAnnotations: z.array(ReportingDataAnnotationSchema).optional(),
});

// ── Data API — shared building blocks ────────────────────────────────────────

export const DimensionHeaderSchema = z.object({
  name: z.string(),
});

export const MetricHeaderSchema = z.object({
  name: z.string(),
  /** e.g. "TYPE_INTEGER" | "TYPE_FLOAT" | "TYPE_SECONDS" | "TYPE_MILLISECONDS" | "TYPE_MINUTES" | "TYPE_HOURS" | "TYPE_STANDARD" | "TYPE_CURRENCY" | "TYPE_FEET" | "TYPE_MILES" | "TYPE_METERS" | "TYPE_KILOMETERS" */
  type: z.string().optional(),
});

export const DimensionValueSchema = z.object({
  value: z.string().optional(),
});

export const MetricValueSchema = z.object({
  value: z.string().optional(),
});

export const RowSchema = z.object({
  dimensionValues: z.array(DimensionValueSchema).optional(),
  metricValues: z.array(MetricValueSchema).optional(),
});

export const ResponseMetaDataSchema = z.object({
  dataLossFromOtherRow: z.boolean().optional(),
  schemaRestrictionResponse: z.unknown().optional(),
  currencyCode: z.string().optional(),
  timeZone: z.string().optional(),
  emptyReason: z.string().optional(),
  subjectToThresholding: z.boolean().optional(),
  samplingMetadatas: z.array(z.unknown()).optional(),
});

/** Quota state returned when `returnPropertyQuota: true`. */
export const PropertyQuotaSchema = z
  .object({
    tokensPerDay: z
      .object({ consumed: z.number(), remaining: z.number() })
      .optional(),
    tokensPerHour: z
      .object({ consumed: z.number(), remaining: z.number() })
      .optional(),
    concurrentRequests: z
      .object({ consumed: z.number(), remaining: z.number() })
      .optional(),
    serverErrorsPerProjectPerHour: z
      .object({ consumed: z.number(), remaining: z.number() })
      .optional(),
    potentiallyThresholdedRequestsPerHour: z
      .object({ consumed: z.number(), remaining: z.number() })
      .optional(),
    tokensPerProjectPerHour: z
      .object({ consumed: z.number(), remaining: z.number() })
      .optional(),
  })
  .optional();

// ── Data API — runReport ──────────────────────────────────────────────────────

export const RunReportOutputSchema = z.object({
  dimensionHeaders: z.array(DimensionHeaderSchema).optional(),
  metricHeaders: z.array(MetricHeaderSchema).optional(),
  rows: z.array(RowSchema).optional(),
  totals: z.array(RowSchema).optional(),
  maximums: z.array(RowSchema).optional(),
  minimums: z.array(RowSchema).optional(),
  rowCount: z.number().optional(),
  metadata: ResponseMetaDataSchema.optional(),
  propertyQuota: PropertyQuotaSchema.optional(),
  /** Always "analyticsData#runReport". */
  kind: z.string().optional(),
});

// ── Data API — runRealtimeReport ─────────────────────────────────────────────

export const RunRealtimeReportOutputSchema = z.object({
  dimensionHeaders: z.array(DimensionHeaderSchema).optional(),
  metricHeaders: z.array(MetricHeaderSchema).optional(),
  rows: z.array(RowSchema).optional(),
  totals: z.array(RowSchema).optional(),
  maximums: z.array(RowSchema).optional(),
  minimums: z.array(RowSchema).optional(),
  rowCount: z.number().optional(),
  propertyQuota: PropertyQuotaSchema.optional(),
  /** Always "analyticsData#runRealtimeReport". */
  kind: z.string().optional(),
});

// ── Data API — runFunnelReport ────────────────────────────────────────────────

const FunnelResponseMetaDataSchema = z.object({
  samplingMetadatas: z.array(z.unknown()).optional(),
  schemaRestrictionResponse: z.unknown().optional(),
});

/**
 * Funnel response rows share the same Row structure (dimensionValues +
 * metricValues), grouped in funnelTable and funnelVisualization sub-objects.
 */
const FunnelSubReportSchema = z.object({
  dimensionHeaders: z.array(DimensionHeaderSchema).optional(),
  metricHeaders: z.array(MetricHeaderSchema).optional(),
  rows: z.array(RowSchema).optional(),
  totals: z.array(RowSchema).optional(),
  maximums: z.array(RowSchema).optional(),
  minimums: z.array(RowSchema).optional(),
  rowCount: z.number().optional(),
  metadata: FunnelResponseMetaDataSchema.optional(),
});

export const RunFunnelReportOutputSchema = z.object({
  funnelTable: FunnelSubReportSchema.optional(),
  funnelVisualization: FunnelSubReportSchema.optional(),
  propertyQuota: PropertyQuotaSchema.optional(),
  /** Always "analyticsData#runFunnelReport". */
  kind: z.string().optional(),
});
