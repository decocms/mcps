/**
 * Google Tag Manager API types
 * Based on GTM API v2 specification
 */

/**
 * GTM Account
 * Represents a Tag Manager Account
 */
export interface Account {
  path: string;
  accountId: string;
  name: string;
  shareData?: boolean;
  fingerprint?: string;
  tagManagerUrl?: string;
  features?: {
    supportUserPermissions?: boolean;
    supportMultipleContainers?: boolean;
  };
}

/**
 * Container for web or mobile apps
 */
export interface Container {
  path: string;
  accountId: string;
  containerId: string;
  name: string;
  publicId?: string;
  usageContext: ContainerUsageContext[];
  fingerprint: string;
  tagManagerUrl: string;
  domainName?: string[];
  notes?: string;
  taggingServerUrls?: string[];
}

export type ContainerUsageContext =
  | "web"
  | "android"
  | "ios"
  | "amp"
  | "server";

/**
 * Workspace for managing container versions
 */
export interface Workspace {
  path: string;
  accountId: string;
  containerId: string;
  workspaceId: string;
  name: string;
  description?: string;
  fingerprint: string;
  tagManagerUrl: string;
}

/**
 * Tag fires based on triggers
 */
export interface Tag {
  path: string;
  accountId: string;
  containerId: string;
  workspaceId: string;
  tagId: string;
  name: string;
  type: string;
  parameter?: Parameter[];
  fingerprint: string;
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  tagFiringOption?: TagFiringOption;
  monitoringMetadata?: Parameter;
  consentSettings?: TagConsentSetting;
  notes?: string;
  scheduleStartMs?: string;
  scheduleEndMs?: string;
  priority?: Parameter;
  liveOnly?: boolean;
  tagManagerUrl: string;
  parentFolderId?: string;
  paused?: boolean;
}

export type TagFiringOption = "oncePerEvent" | "oncePerLoad" | "unlimited";

export interface TagConsentSetting {
  consentStatus?: ConsentStatus;
  consentType?: Parameter;
}

export type ConsentStatus = "notSet" | "notNeeded" | "needed";

/**
 * Trigger determines when tags fire
 */
export interface Trigger {
  path: string;
  accountId: string;
  containerId: string;
  workspaceId: string;
  triggerId: string;
  name: string;
  type: string;
  filter?: Condition[];
  autoEventFilter?: Condition[];
  customEventFilter?: Condition[];
  checkValidation?: Parameter;
  waitForTags?: Parameter;
  waitForTagsTimeout?: Parameter;
  uniqueTriggerId?: Parameter;
  eventName?: Parameter;
  fingerprint: string;
  parentFolderId?: string;
  notes?: string;
  tagManagerUrl: string;
  continuousTimeMinMilliseconds?: Parameter;
  maxTimerLengthSeconds?: Parameter;
  totalTimeMinMilliseconds?: Parameter;
  interval?: Parameter;
  intervalSeconds?: Parameter;
  limit?: Parameter;
  visiblePercentageMin?: Parameter;
  visiblePercentageMax?: Parameter;
  visibilitySelector?: Parameter;
  horizontalScrollPercentageList?: Parameter;
  verticalScrollPercentageList?: Parameter;
  selector?: Parameter;
}

/**
 * Condition for filters
 */
export interface Condition {
  type: ConditionType;
  parameter?: Parameter[];
}

export type ConditionType =
  | "equals"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "matchRegex"
  | "greater"
  | "greaterOrEquals"
  | "less"
  | "lessOrEquals"
  | "cssSelector"
  | "urlMatches";

/**
 * Variable stores reusable values
 */
export interface Variable {
  path: string;
  accountId: string;
  containerId: string;
  workspaceId: string;
  variableId: string;
  name: string;
  type: string;
  parameter?: Parameter[];
  fingerprint: string;
  parentFolderId?: string;
  notes?: string;
  scheduleStartMs?: string;
  scheduleEndMs?: string;
  disablingTriggerId?: string[];
  enablingTriggerId?: string[];
  tagManagerUrl: string;
  formatValue?: Parameter;
}

/**
 * Generic parameter used across GTM entities
 */
export interface Parameter {
  type: ParameterType;
  key?: string;
  value?: string;
  list?: Parameter[];
  map?: Parameter[];
  isWeakReference?: boolean;
}

export type ParameterType =
  | "template"
  | "integer"
  | "boolean"
  | "list"
  | "map"
  | "tagReference";

/**
 * List response for accounts
 */
export interface AccountsListResponse {
  account: Account[];
  nextPageToken?: string;
}

/**
 * List response for containers
 */
export interface ContainersListResponse {
  container: Container[];
  nextPageToken?: string;
}

/**
 * List response for workspaces
 */
export interface WorkspacesListResponse {
  workspace: Workspace[];
  nextPageToken?: string;
}

/**
 * List response for tags
 */
export interface TagsListResponse {
  tag: Tag[];
  nextPageToken?: string;
}

/**
 * List response for triggers
 */
export interface TriggersListResponse {
  trigger: Trigger[];
  nextPageToken?: string;
}

/**
 * List response for variables
 */
export interface VariablesListResponse {
  variable: Variable[];
  nextPageToken?: string;
}

/**
 * Input for creating a container
 */
export interface CreateContainerInput {
  name: string;
  usageContext: ContainerUsageContext[];
  domainName?: string[];
  notes?: string;
}

/**
 * Input for creating a workspace
 */
export interface CreateWorkspaceInput {
  name: string;
  description: string;
}

/**
 * Input for creating a tag
 */
export interface CreateTagInput {
  name: string;
  type: string;
  parameter?: Parameter[];
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  tagFiringOption?: TagFiringOption;
  notes?: string;
  liveOnly?: boolean;
  parentFolderId?: string;
  paused?: boolean;
}

/**
 * Input for updating a tag
 */
export interface UpdateTagInput extends Partial<CreateTagInput> {
  fingerprint: string;
}

/**
 * Input for creating a trigger
 */
export interface CreateTriggerInput {
  name: string;
  type: string;
  filter?: Condition[];
  autoEventFilter?: Condition[];
  customEventFilter?: Condition[];
  eventName?: Parameter;
  notes?: string;
  parentFolderId?: string;
}

/**
 * Input for updating a trigger
 */
export interface UpdateTriggerInput extends Partial<CreateTriggerInput> {
  fingerprint: string;
}

/**
 * Input for creating a variable
 */
export interface CreateVariableInput {
  name: string;
  type: string;
  parameter?: Parameter[];
  notes?: string;
  parentFolderId?: string;
  disablingTriggerId?: string[];
  enablingTriggerId?: string[];
}

/**
 * Input for updating a variable
 */
export interface UpdateVariableInput extends Partial<CreateVariableInput> {
  fingerprint: string;
}
