/**
 * Google Apps Script API Types
 * Based on https://developers.google.com/apps-script/api/reference/rest
 */

// ============================================
// File Types
// ============================================

export type FileType = "ENUM_TYPE_UNSPECIFIED" | "SERVER_JS" | "HTML" | "JSON";

export interface ScriptFile {
  /** The name of the file. */
  name: string;
  /** The type of the file. */
  type: FileType;
  /** The file content. */
  source: string;
  /** Function set used to determine which functions are visible in the Apps Script file. */
  functionSet?: FunctionSet;
  /** Last modified date and time. */
  lastModifyUser?: GoogleAppsScriptTypeUser;
  /** Creation date and time. */
  createTime?: string;
  /** Last modified time. */
  updateTime?: string;
}

export interface FunctionSet {
  /** A list of functions composing the set. */
  values?: GoogleAppsScriptTypeFunction[];
}

export interface GoogleAppsScriptTypeFunction {
  /** The function name in the script project. */
  name?: string;
}

export interface GoogleAppsScriptTypeUser {
  /** The user's domain. */
  domain?: string;
  /** The user's email address. */
  email?: string;
  /** The user's display name. */
  name?: string;
  /** The user's photo. */
  photoUrl?: string;
}

// ============================================
// Project Types
// ============================================

export interface Project {
  /** The script project's Drive ID. */
  scriptId?: string;
  /** The title for the project. */
  title?: string;
  /** The parent's Drive ID that the script will be attached to. */
  parentId?: string;
  /** When the script was created. */
  createTime?: string;
  /** When the script was last updated. */
  updateTime?: string;
  /** User who originally created the script. */
  creator?: GoogleAppsScriptTypeUser;
  /** User who last modified the script. */
  lastModifyUser?: GoogleAppsScriptTypeUser;
}

export interface Content {
  /** The script project's Drive ID. */
  scriptId?: string;
  /** The list of script project files. */
  files?: ScriptFile[];
}

export interface CreateProjectRequest {
  /** The title for the project. */
  title: string;
  /** The Drive ID of a parent file that the created script project is bound to. */
  parentId?: string;
}

export interface UpdateContentRequest {
  /** The list of script project files. */
  files: ScriptFile[];
}

// ============================================
// Version Types
// ============================================

export interface Version {
  /** The incremental ID. */
  versionNumber?: number;
  /** The script project's Drive ID. */
  scriptId?: string;
  /** The description for this version. */
  description?: string;
  /** When the version was created. */
  createTime?: string;
}

export interface CreateVersionRequest {
  /** The description for this version. */
  description?: string;
}

export interface ListVersionsResponse {
  /** The list of versions. */
  versions?: Version[];
  /** The token use to fetch the next page of records. */
  nextPageToken?: string;
}

// ============================================
// Deployment Types
// ============================================

export interface Deployment {
  /** The deployment ID for this deployment. */
  deploymentId?: string;
  /** The deployment configuration. */
  deploymentConfig?: DeploymentConfig;
  /** Last modified date and time. */
  updateTime?: string;
  /** The deployment's entry points. */
  entryPoints?: EntryPoint[];
}

export interface DeploymentConfig {
  /** The script project's Drive ID. */
  scriptId?: string;
  /** The version number on which this deployment is based. */
  versionNumber?: number;
  /** The manifest file name for this deployment. */
  manifestFileName?: string;
  /** The description for this deployment. */
  description?: string;
}

export interface EntryPoint {
  /** The type of the entry point. */
  entryPointType?: EntryPointType;
  /** A web application entry point. */
  webApp?: GoogleAppsScriptTypeWebAppEntryPoint;
  /** An API executable entry point. */
  executionApi?: GoogleAppsScriptTypeExecutionApiEntryPoint;
  /** Add-on properties. */
  addOn?: GoogleAppsScriptTypeAddOnEntryPoint;
}

export type EntryPointType =
  | "ENTRY_POINT_TYPE_UNSPECIFIED"
  | "WEB_APP"
  | "EXECUTION_API"
  | "ADD_ON";

export interface GoogleAppsScriptTypeWebAppEntryPoint {
  /** The URL for the web application. */
  url?: string;
  /** The entry point's configuration. */
  entryPointConfig?: GoogleAppsScriptTypeWebAppConfig;
}

export interface GoogleAppsScriptTypeWebAppConfig {
  /** Who has permission to run the web app. */
  access?: WebAppAccess;
  /** Who to execute the web app as. */
  executeAs?: WebAppExecuteAs;
}

export type WebAppAccess =
  | "UNKNOWN_ACCESS"
  | "MYSELF"
  | "DOMAIN"
  | "ANYONE"
  | "ANYONE_ANONYMOUS";

export type WebAppExecuteAs =
  | "UNKNOWN_EXECUTE_AS"
  | "USER_ACCESSING"
  | "USER_DEPLOYING";

export interface GoogleAppsScriptTypeExecutionApiEntryPoint {
  /** The entry point's configuration. */
  entryPointConfig?: GoogleAppsScriptTypeExecutionApiConfig;
}

export interface GoogleAppsScriptTypeExecutionApiConfig {
  /** Who has permission to run the API executable. */
  access?: ExecutionApiAccess;
}

export type ExecutionApiAccess =
  | "UNKNOWN_ACCESS"
  | "MYSELF"
  | "DOMAIN"
  | "ANYONE"
  | "ANYONE_ANONYMOUS";

export interface GoogleAppsScriptTypeAddOnEntryPoint {
  /** The add-on's required list of supported container types. */
  addOnType?: AddOnType;
  /** The add-on's optional title. */
  title?: string;
  /** The add-on's optional description. */
  description?: string;
  /** The add-on's optional help URL. */
  helpUrl?: string;
  /** The add-on's optional report issue URL. */
  reportIssueUrl?: string;
  /** The add-on's required post install tip URL. */
  postInstallTipUrl?: string;
}

export type AddOnType = "UNKNOWN_ADDON_TYPE" | "GMAIL" | "DATA_STUDIO";

export interface CreateDeploymentRequest {
  /** The version number on which this deployment is based. */
  versionNumber: number;
  /** The manifest file name for this deployment. */
  manifestFileName?: string;
  /** The description for this deployment. */
  description?: string;
}

export interface UpdateDeploymentRequest {
  /** The deployment configuration. */
  deploymentConfig: DeploymentConfig;
}

export interface ListDeploymentsResponse {
  /** The list of deployments. */
  deployments?: Deployment[];
  /** The token that can be used in the next call to get the next page of results. */
  nextPageToken?: string;
}

// ============================================
// Execution Types
// ============================================

export interface ExecutionRequest {
  /** The name of the function to execute in the given script. */
  function: string;
  /** The parameters to be passed to the function being executed. */
  parameters?: any[];
  /** For Android add-ons only. */
  sessionState?: string;
  /** If true and the user is an owner of the script, executes the script under development. */
  devMode?: boolean;
}

export interface ExecutionResponse {
  /** If a run call succeeds but the script function throws an exception, this field contains a Status object. */
  error?: Status;
  /** The return value of the script function. */
  result?: any;
}

export interface Status {
  /** The status code. */
  code?: number;
  /** A developer-facing error message. */
  message?: string;
  /** A list of messages that carry the error details. */
  details?: any[];
}

export interface Operation {
  /** The server-assigned name. */
  name?: string;
  /** Service-specific metadata. */
  metadata?: any;
  /** Indicates whether the operation has completed. */
  done?: boolean;
  /** The error result of the operation in case of failure. */
  error?: Status;
  /** The normal response of the operation in case of success. */
  response?: ExecutionResponse;
}

// ============================================
// Process Types
// ============================================

export type ProcessType =
  | "PROCESS_TYPE_UNSPECIFIED"
  | "ADD_ON"
  | "EXECUTION_API"
  | "TIME_DRIVEN"
  | "TRIGGER"
  | "WEBAPP"
  | "EDITOR"
  | "SIMPLE_TRIGGER"
  | "MENU"
  | "BATCH_TASK";

export type ProcessStatus =
  | "PROCESS_STATUS_UNSPECIFIED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED"
  | "TIMED_OUT"
  | "UNKNOWN"
  | "DELAYED";

export type UserAccessLevel =
  | "USER_ACCESS_LEVEL_UNSPECIFIED"
  | "NONE"
  | "READ"
  | "WRITE"
  | "OWNER";

export interface GoogleAppsScriptTypeProcess {
  /** Name of the project being executed. */
  projectName?: string;
  /** Name of the function the started the execution. */
  functionName?: string;
  /** The executing user's access level to the script. */
  userAccessLevel?: UserAccessLevel;
  /** The executions type. */
  processType?: ProcessType;
  /** The executions status. */
  processStatus?: ProcessStatus;
  /** Time the execution started. */
  startTime?: string;
  /** Duration the execution spent executing. */
  duration?: string;
}

export interface ListUserProcessesResponse {
  /** List of processes matching request parameters. */
  processes?: GoogleAppsScriptTypeProcess[];
  /** Token for the next page of results. */
  nextPageToken?: string;
}

export interface ListScriptProcessesResponse {
  /** List of processes matching request parameters. */
  processes?: GoogleAppsScriptTypeProcess[];
  /** Token for the next page of results. */
  nextPageToken?: string;
}

// ============================================
// Metrics Types
// ============================================

export interface Metrics {
  /** Number of active users. */
  activeUsers?: MetricsValue[];
  /** Number of total executions. */
  totalExecutions?: MetricsValue[];
  /** Number of failed executions. */
  failedExecutions?: MetricsValue[];
}

export interface MetricsValue {
  /** Required field indicating the value. */
  value?: string;
  /** Required field indicating the start time of the interval. */
  startTime?: string;
  /** Required field indicating the end time of the interval. */
  endTime?: string;
}

export interface GetMetricsResponse {
  /** The metrics returned. */
  metrics?: Metrics;
}

// ============================================
// API Error Types
// ============================================

export interface ApiError {
  error: {
    code: number;
    message: string;
    status?: string;
    details?: any[];
  };
}
