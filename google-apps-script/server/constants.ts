/**
 * Google Apps Script API constants
 */

export const APPS_SCRIPT_API_BASE = "https://script.googleapis.com/v1";

export const ENDPOINTS = {
  // Projects
  PROJECTS: APPS_SCRIPT_API_BASE + "/projects",
  PROJECT: (scriptId: string) => `${APPS_SCRIPT_API_BASE}/projects/${scriptId}`,
  PROJECT_CONTENT: (scriptId: string) =>
    `${APPS_SCRIPT_API_BASE}/projects/${scriptId}/content`,
  PROJECT_METRICS: (scriptId: string) =>
    `${APPS_SCRIPT_API_BASE}/projects/${scriptId}/metrics`,

  // Scripts (Execution)
  SCRIPT_RUN: (scriptId: string) =>
    `${APPS_SCRIPT_API_BASE}/scripts/${scriptId}:run`,

  // Versions
  VERSIONS: (scriptId: string) =>
    `${APPS_SCRIPT_API_BASE}/projects/${scriptId}/versions`,
  VERSION: (scriptId: string, versionNumber: number) =>
    `${APPS_SCRIPT_API_BASE}/projects/${scriptId}/versions/${versionNumber}`,

  // Deployments
  DEPLOYMENTS: (scriptId: string) =>
    `${APPS_SCRIPT_API_BASE}/projects/${scriptId}/deployments`,
  DEPLOYMENT: (scriptId: string, deploymentId: string) =>
    `${APPS_SCRIPT_API_BASE}/projects/${scriptId}/deployments/${deploymentId}`,

  // Processes
  PROCESSES: APPS_SCRIPT_API_BASE + "/processes",
  SCRIPT_PROCESSES: (scriptId: string) =>
    `${APPS_SCRIPT_API_BASE}/projects/${scriptId}/processes`,
};

export const FILE_TYPE = {
  ENUM_TYPE_UNSPECIFIED: "ENUM_TYPE_UNSPECIFIED",
  SERVER_JS: "SERVER_JS",
  HTML: "HTML",
  JSON: "JSON",
} as const;

export const PROCESS_TYPE = {
  PROCESS_TYPE_UNSPECIFIED: "PROCESS_TYPE_UNSPECIFIED",
  ADD_ON: "ADD_ON",
  EXECUTION_API: "EXECUTION_API",
  TIME_DRIVEN: "TIME_DRIVEN",
  TRIGGER: "TRIGGER",
  WEBAPP: "WEBAPP",
  EDITOR: "EDITOR",
  SIMPLE_TRIGGER: "SIMPLE_TRIGGER",
  MENU: "MENU",
  BATCH_TASK: "BATCH_TASK",
} as const;

export const PROCESS_STATUS = {
  PROCESS_STATUS_UNSPECIFIED: "PROCESS_STATUS_UNSPECIFIED",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELED",
  FAILED: "FAILED",
  TIMED_OUT: "TIMED_OUT",
  UNKNOWN: "UNKNOWN",
  DELAYED: "DELAYED",
} as const;

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  SCRIPT_PROJECTS: "https://www.googleapis.com/auth/script.projects",
  SCRIPT_PROJECTS_READONLY:
    "https://www.googleapis.com/auth/script.projects.readonly",
  SCRIPT_DEPLOYMENTS: "https://www.googleapis.com/auth/script.deployments",
  SCRIPT_DEPLOYMENTS_READONLY:
    "https://www.googleapis.com/auth/script.deployments.readonly",
  SCRIPT_METRICS: "https://www.googleapis.com/auth/script.metrics",
  SCRIPT_PROCESSES: "https://www.googleapis.com/auth/script.processes",
} as const;
