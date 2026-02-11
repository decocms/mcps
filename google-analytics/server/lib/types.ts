/**
 * TypeScript types for Google Analytics API responses
 */

// ==================== Data API Types ====================

export interface DateRange {
  startDate: string;
  endDate: string;
  name?: string;
}

export interface Dimension {
  name: string;
}

export interface Metric {
  name: string;
}

export interface DimensionValue {
  value?: string;
  oneValue?: string;
}

export interface MetricValue {
  value?: string;
  oneValue?: string;
}

export interface Row {
  dimensionValues?: DimensionValue[];
  metricValues?: MetricValue[];
}

export interface DimensionHeader {
  name: string;
}

export interface MetricHeader {
  name: string;
  type: string;
}

export interface RunReportResponse {
  dimensionHeaders?: DimensionHeader[];
  metricHeaders?: MetricHeader[];
  rows?: Row[];
  totals?: Row[];
  maximums?: Row[];
  minimums?: Row[];
  rowCount?: number;
  metadata?: ReportMetadata;
  propertyQuota?: PropertyQuota;
}

export interface ReportMetadata {
  currencyCode?: string;
  timeZone?: string;
  dataLossFromOtherRow?: boolean;
}

export interface PropertyQuota {
  tokensPerDay?: QuotaStatus;
  tokensPerHour?: QuotaStatus;
  concurrentRequests?: QuotaStatus;
  serverErrorsPerProjectPerHour?: QuotaStatus;
}

export interface QuotaStatus {
  consumed?: number;
  remaining?: number;
}

export interface RunReportRequest {
  dateRanges: DateRange[];
  dimensions?: Dimension[];
  metrics: Metric[];
  limit?: number;
  offset?: number;
  dimensionFilter?: FilterExpression;
  metricFilter?: FilterExpression;
  orderBys?: OrderBy[];
  currencyCode?: string;
  cohortSpec?: CohortSpec;
  keepEmptyRows?: boolean;
  returnPropertyQuota?: boolean;
}

export interface FilterExpression {
  andGroup?: FilterExpressionList;
  orGroup?: FilterExpressionList;
  notExpression?: FilterExpression;
  filter?: Filter;
}

export interface FilterExpressionList {
  expressions: FilterExpression[];
}

export interface Filter {
  fieldName: string;
  stringFilter?: StringFilter;
  inListFilter?: InListFilter;
  numericFilter?: NumericFilter;
  betweenFilter?: BetweenFilter;
}

export interface StringFilter {
  matchType:
    | "EXACT"
    | "BEGINS_WITH"
    | "ENDS_WITH"
    | "CONTAINS"
    | "FULL_REGEXP"
    | "PARTIAL_REGEXP";
  value: string;
  caseSensitive?: boolean;
}

export interface InListFilter {
  values: string[];
  caseSensitive?: boolean;
}

export interface NumericFilter {
  operation:
    | "EQUAL"
    | "LESS_THAN"
    | "LESS_THAN_OR_EQUAL"
    | "GREATER_THAN"
    | "GREATER_THAN_OR_EQUAL";
  value: NumericValue;
}

export interface NumericValue {
  int64Value?: string;
  doubleValue?: number;
}

export interface BetweenFilter {
  fromValue: NumericValue;
  toValue: NumericValue;
}

export interface OrderBy {
  desc?: boolean;
  dimension?: DimensionOrderBy;
  metric?: MetricOrderBy;
}

export interface DimensionOrderBy {
  dimensionName: string;
  orderType?: "ALPHANUMERIC" | "CASE_INSENSITIVE_ALPHANUMERIC" | "NUMERIC";
}

export interface MetricOrderBy {
  metricName: string;
}

export interface CohortSpec {
  cohorts: Cohort[];
  cohortsRange?: CohortsRange;
  cohortReportSettings?: CohortReportSettings;
}

export interface Cohort {
  name: string;
  dimension: string;
  dateRange: DateRange;
}

export interface CohortsRange {
  granularity: "DAILY" | "WEEKLY" | "MONTHLY";
  startOffset?: number;
  endOffset?: number;
}

export interface CohortReportSettings {
  accumulate?: boolean;
}

// Realtime Report
export interface RunRealtimeReportRequest {
  dimensions?: Dimension[];
  metrics: Metric[];
  limit?: number;
  dimensionFilter?: FilterExpression;
  metricFilter?: FilterExpression;
  orderBys?: OrderBy[];
  returnPropertyQuota?: boolean;
  minuteRanges?: MinuteRange[];
}

export interface MinuteRange {
  startMinutesAgo?: number;
  endMinutesAgo?: number;
  name?: string;
}

export interface RunRealtimeReportResponse {
  dimensionHeaders?: DimensionHeader[];
  metricHeaders?: MetricHeader[];
  rows?: Row[];
  totals?: Row[];
  maximums?: Row[];
  minimums?: Row[];
  rowCount?: number;
  propertyQuota?: PropertyQuota;
}

// ==================== Admin API Types ====================

export interface Property {
  name: string;
  createTime?: string;
  updateTime?: string;
  parent?: string;
  displayName: string;
  industryCategory?: string;
  timeZone: string;
  currencyCode: string;
  serviceLevel?: string;
  deleteTime?: string;
  expireTime?: string;
  account?: string;
}

export interface ListPropertiesResponse {
  properties: Property[];
  nextPageToken?: string;
}

export interface DataStream {
  name: string;
  type: "WEB_DATA_STREAM" | "ANDROID_APP_DATA_STREAM" | "IOS_APP_DATA_STREAM";
  displayName: string;
  createTime?: string;
  updateTime?: string;
  webStreamData?: WebStreamData;
  androidAppStreamData?: AndroidAppStreamData;
  iosAppStreamData?: IosAppStreamData;
}

export interface WebStreamData {
  measurementId: string;
  firebaseAppId?: string;
  defaultUri?: string;
}

export interface AndroidAppStreamData {
  firebaseAppId?: string;
  packageName: string;
}

export interface IosAppStreamData {
  firebaseAppId?: string;
  bundleId: string;
}

export interface ListDataStreamsResponse {
  dataStreams: DataStream[];
  nextPageToken?: string;
}

// ==================== Request Input Types ====================

export interface RunReportInput {
  propertyId: string;
  dateRanges: DateRange[];
  dimensions?: string[];
  metrics: string[];
  limit?: number;
  offset?: number;
  orderBys?: OrderBy[];
  dimensionFilter?: FilterExpression;
  metricFilter?: FilterExpression;
  keepEmptyRows?: boolean;
  returnPropertyQuota?: boolean;
}

export interface RunRealtimeReportInput {
  propertyId: string;
  dimensions?: string[];
  metrics: string[];
  limit?: number;
  orderBys?: OrderBy[];
  minuteRanges?: MinuteRange[];
}

export interface ListPropertiesInput {
  filter?: string;
  pageSize?: number;
  pageToken?: string;
  showDeleted?: boolean;
}

export interface ListDataStreamsInput {
  propertyId: string;
  pageSize?: number;
  pageToken?: string;
}
