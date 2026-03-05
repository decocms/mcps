/**
 * BigQuery API Types
 */

// ==================== Dataset Types ====================

export interface Dataset {
  kind: string;
  id: string;
  datasetReference: DatasetReference;
  friendlyName?: string;
  description?: string;
  location?: string;
  creationTime?: string;
  lastModifiedTime?: string;
}

export interface DatasetReference {
  projectId: string;
  datasetId: string;
}

export interface DatasetsListResponse {
  kind: string;
  etag?: string;
  nextPageToken?: string;
  datasets?: Dataset[];
}

// ==================== Table Types ====================

export interface Table {
  kind: string;
  id: string;
  tableReference: TableReference;
  friendlyName?: string;
  description?: string;
  type?: string;
  creationTime?: string;
  expirationTime?: string;
  numBytes?: string;
  numRows?: string;
  schema?: TableSchema;
}

export interface TableReference {
  projectId: string;
  datasetId: string;
  tableId: string;
}

export interface TableSchema {
  fields?: TableFieldSchema[];
}

export interface TableFieldSchema {
  name: string;
  type: string;
  mode?: string;
  description?: string;
  fields?: TableFieldSchema[];
}

export interface TablesListResponse {
  kind: string;
  etag?: string;
  nextPageToken?: string;
  tables?: Table[];
  totalItems?: number;
}

// ==================== Query Types ====================

export interface QueryRequest {
  query: string;
  useLegacySql?: boolean;
  maxResults?: number;
  timeoutMs?: number;
  dryRun?: boolean;
  useQueryCache?: boolean;
  defaultDataset?: DatasetReference;
  parameterMode?: string;
  queryParameters?: QueryParameter[];
}

export interface QueryParameter {
  name?: string;
  parameterType: QueryParameterType;
  parameterValue: QueryParameterValue;
}

export interface QueryParameterType {
  type: string;
  arrayType?: QueryParameterType;
  structTypes?: Array<{
    name?: string;
    type: QueryParameterType;
  }>;
}

export interface QueryParameterValue {
  value?: string;
  arrayValues?: QueryParameterValue[];
  structValues?: Record<string, QueryParameterValue>;
}

export interface QueryResponse {
  kind: string;
  schema?: TableSchema;
  jobReference?: JobReference;
  totalRows?: string;
  pageToken?: string;
  rows?: TableRow[];
  totalBytesProcessed?: string;
  jobComplete?: boolean;
  errors?: ErrorProto[];
  cacheHit?: boolean;
  numDmlAffectedRows?: string;
}

export interface TableRow {
  f?: TableCell[];
}

export interface TableCell {
  v?: unknown;
}

export interface JobReference {
  projectId: string;
  jobId: string;
  location?: string;
}

export interface ErrorProto {
  reason?: string;
  location?: string;
  debugInfo?: string;
  message?: string;
}

// ==================== Job Types ====================

export interface Job {
  kind: string;
  etag?: string;
  id?: string;
  selfLink?: string;
  jobReference?: JobReference;
  configuration?: JobConfiguration;
  status?: JobStatus;
  statistics?: JobStatistics;
}

export interface JobConfiguration {
  query?: JobConfigurationQuery;
  jobType?: string;
}

export interface JobConfigurationQuery {
  query: string;
  destinationTable?: TableReference;
  useLegacySql?: boolean;
}

export interface JobStatus {
  state?: string;
  errorResult?: ErrorProto;
  errors?: ErrorProto[];
}

export interface JobStatistics {
  creationTime?: string;
  startTime?: string;
  endTime?: string;
  totalBytesProcessed?: string;
  query?: JobStatisticsQuery;
}

export interface JobStatisticsQuery {
  totalBytesProcessed?: string;
  totalBytesBilled?: string;
  cacheHit?: boolean;
  statementType?: string;
}

export interface GetQueryResultsResponse {
  kind: string;
  etag?: string;
  schema?: TableSchema;
  jobReference?: JobReference;
  totalRows?: string;
  pageToken?: string;
  rows?: TableRow[];
  totalBytesProcessed?: string;
  jobComplete?: boolean;
  errors?: ErrorProto[];
  cacheHit?: boolean;
}

export interface JobsListResponse {
  kind: string;
  etag?: string;
  nextPageToken?: string;
  jobs?: JobListEntry[];
}

export interface JobListEntry {
  id?: string;
  kind?: string;
  jobReference?: JobReference;
  state?: string;
  configuration?: JobConfiguration;
  status?: JobStatus;
  statistics?: JobStatistics;
  errorResult?: ErrorProto;
}

// ==================== Project Types ====================

export interface Project {
  kind: string;
  id: string;
  numericId?: string;
  projectReference: ProjectReference;
  friendlyName?: string;
}

export interface ProjectReference {
  projectId: string;
}

export interface ProjectsListResponse {
  kind: string;
  etag?: string;
  nextPageToken?: string;
  projects?: Project[];
  totalItems?: number;
}
