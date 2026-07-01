/**
 * Zod output schemas for all GA4 API responses.
 *
 * Sources:
 *  - Data API:  https://developers.google.com/analytics/devguides/reporting/data/v1/rest
 *  - Admin API: https://developers.google.com/analytics/devguides/config/admin/v1/rest
 */

import { z } from "zod";

// ── Shared primitives ────────────────────────────────────────────────────────

const Timestamp = z.string();

const DateSchema = z.object({
  year: z.number().int().optional(),
  month: z.number().int().optional(),
  day: z.number().int().optional(),
});

// ── Admin API — Account Summaries ────────────────────────────────────────────

export const PropertySummarySchema = z.object({
  property: z.string(),
  displayName: z.string(),
  propertyType: z.string().optional(),
  parent: z.string().optional(),
});

export const AccountSummarySchema = z.object({
  name: z.string(),
  account: z.string().optional(),
  displayName: z.string().optional(),
  propertySummaries: z.array(PropertySummarySchema).optional(),
});

export const AccountSummariesOutputSchema = z.object({
  accountSummaries: z.array(AccountSummarySchema).optional(),
});

// ── Admin API — Property ─────────────────────────────────────────────────────

export const PropertySchema = z.object({
  name: z.string().optional(),
  parent: z.string().optional(),
  createTime: Timestamp.optional(),
  updateTime: Timestamp.optional(),
  displayName: z.string().optional(),
  industryCategory: z.string().optional(),
  timeZone: z.string().optional(),
  currencyCode: z.string().optional(),
  serviceLevel: z.string().optional(),
  propertyType: z.string().optional(),
  account: z.string().optional(),
  deleteTime: Timestamp.optional(),
  expireTime: Timestamp.optional(),
});

// ── Admin API — Custom Dimensions & Metrics ──────────────────────────────────

export const CustomDimensionSchema = z.object({
  name: z.string().optional(),
  parameterName: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  scope: z.string().optional(),
  disallowAdsPersonalization: z.boolean().optional(),
});

export const CustomMetricSchema = z.object({
  name: z.string().optional(),
  parameterName: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  measurementUnit: z.string().optional(),
  scope: z.string().optional(),
  restrictedMetricType: z.array(z.string()).optional(),
});

export const CustomDimensionsAndMetricsOutputSchema = z.object({
  customDimensions: z.array(CustomDimensionSchema).optional(),
  customMetrics: z.array(CustomMetricSchema).optional(),
});

// ── Admin API — Google Ads Links ─────────────────────────────────────────────

export const GoogleAdsLinkSchema = z.object({
  name: z.string().optional(),
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
  name: z.string().optional(),
  annotationDate: DateSchema.optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  systemGenerated: z.boolean().optional(),
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
  currencyCode: z.string().optional(),
  timeZone: z.string().optional(),
  schemaRestrictionResponse: z.unknown().optional(),
  subjectToThresholding: z.boolean().optional(),
  samplingMetadatas: z.array(z.unknown()).optional(),
});

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
    tokensPerProjectPerDay: z
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
  kind: z.string().optional(),
});

// ── Data API — runFunnelReport ────────────────────────────────────────────────

const FunnelResponseMetaDataSchema = z.object({
  samplingMetadatas: z.array(z.unknown()).optional(),
  schemaRestrictionResponse: z.unknown().optional(),
});

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
  kind: z.string().optional(),
});
