/**
 * Google Tag Manager API constants and configuration
 */

export const GTM_API_BASE = "https://tagmanager.googleapis.com/tagmanager/v2";

/**
 * API Endpoints for Google Tag Manager
 */
export const ENDPOINTS = {
  // Account endpoints
  ACCOUNTS: `${GTM_API_BASE}/accounts`,
  ACCOUNT: (accountId: string) => `${GTM_API_BASE}/accounts/${accountId}`,

  // Container endpoints
  CONTAINERS: (accountId: string) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers`,
  CONTAINER: (accountId: string, containerId: string) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}`,

  // Workspace endpoints
  WORKSPACES: (accountId: string, containerId: string) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}/workspaces`,
  WORKSPACE: (accountId: string, containerId: string, workspaceId: string) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,

  // Tag endpoints
  TAGS: (accountId: string, containerId: string, workspaceId: string) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags`,
  TAG: (
    accountId: string,
    containerId: string,
    workspaceId: string,
    tagId: string,
  ) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags/${tagId}`,

  // Trigger endpoints
  TRIGGERS: (accountId: string, containerId: string, workspaceId: string) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers`,
  TRIGGER: (
    accountId: string,
    containerId: string,
    workspaceId: string,
    triggerId: string,
  ) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers/${triggerId}`,

  // Variable endpoints
  VARIABLES: (accountId: string, containerId: string, workspaceId: string) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables`,
  VARIABLE: (
    accountId: string,
    containerId: string,
    workspaceId: string,
    variableId: string,
  ) =>
    `${GTM_API_BASE}/accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables/${variableId}`,
};

/**
 * Default pagination limit
 */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Container usage contexts
 */
export const CONTAINER_USAGE_CONTEXTS = {
  WEB: "web",
  ANDROID: "android",
  IOS: "ios",
  AMP: "amp",
  SERVER: "server",
} as const;

/**
 * Common tag types
 */
export const TAG_TYPES = {
  GOOGLE_ANALYTICS_GA4: "gtagua",
  GOOGLE_ANALYTICS_UNIVERSAL: "ua",
  GOOGLE_ADS_CONVERSION: "awct",
  GOOGLE_ADS_REMARKETING: "sp",
  CUSTOM_HTML: "html",
  CUSTOM_IMAGE: "img",
} as const;

/**
 * Common trigger types
 */
export const TRIGGER_TYPES = {
  PAGE_VIEW: "pageview",
  DOM_READY: "domReady",
  WINDOW_LOADED: "windowLoaded",
  CUSTOM_EVENT: "customEvent",
  CLICK: "click",
  FORM_SUBMISSION: "formSubmission",
  TIMER: "timer",
  SCROLL_DEPTH: "scrollDepth",
  VISIBILITY: "elementVisibility",
  YOUTUBE_VIDEO: "youTubeVideo",
  HISTORY_CHANGE: "historyChange",
} as const;

/**
 * Common variable types
 */
export const VARIABLE_TYPES = {
  CONSTANT: "c",
  DATA_LAYER_VARIABLE: "v",
  JAVASCRIPT_VARIABLE: "jsm",
  FIRST_PARTY_COOKIE: "k",
  CUSTOM_JAVASCRIPT: "jsm",
  URL: "u",
  REFERRER: "f",
  AUTO_EVENT_VARIABLE: "aev",
  GOOGLE_ANALYTICS_SETTINGS: "gas",
} as const;

/**
 * Tag firing options
 */
export const TAG_FIRING_OPTIONS = {
  ONCE_PER_EVENT: "oncePerEvent",
  ONCE_PER_LOAD: "oncePerLoad",
  UNLIMITED: "unlimited",
} as const;

/**
 * Condition types for filters
 */
export const CONDITION_TYPES = {
  EQUALS: "equals",
  CONTAINS: "contains",
  STARTS_WITH: "startsWith",
  ENDS_WITH: "endsWith",
  MATCH_REGEX: "matchRegex",
  GREATER: "greater",
  GREATER_OR_EQUALS: "greaterOrEquals",
  LESS: "less",
  LESS_OR_EQUALS: "lessOrEquals",
  CSS_SELECTOR: "cssSelector",
  URL_MATCHES: "urlMatches",
} as const;

/**
 * Parameter types
 */
export const PARAMETER_TYPES = {
  TEMPLATE: "template",
  INTEGER: "integer",
  BOOLEAN: "boolean",
  LIST: "list",
  MAP: "map",
  TAG_REFERENCE: "tagReference",
} as const;
