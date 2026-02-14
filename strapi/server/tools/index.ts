/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { strapiHealthTools } from "./api/health/strapiHealthTool.ts";
import { strapiContentTypesTools } from "./api/content-types/strapiContentTypesTool.ts";
import { strapiContentTools } from "./api/content/strapiContentTool.ts";
import { strapiUsersTools } from "./api/users/strapiUsersTool.ts";
import { strapiMediaTools } from "./api/media/strapiMediaTool.ts";
import { strapiRolesTools } from "./api/roles/strapiRolesTool.ts";
import { strapiPublishTools } from "./api/publish/strapiPublishTool.ts";
import { strapiI18nTools } from "./api/i18n/strapiI18nTool.ts";
import { strapiComponentsTools } from "./api/components/strapiComponentsTool.ts";
import { strapiSingleTypeTools } from "./api/single-type/strapiSingleTypeTool.ts";
import { strapiBulkTools } from "./api/bulk/strapiBulkTool.ts";

// Export all tools from all domains
export const tools = [
  ...strapiHealthTools,
  ...strapiContentTypesTools,
  ...strapiContentTools,
  ...strapiUsersTools,
  ...strapiMediaTools,
  ...strapiRolesTools,
  ...strapiPublishTools,
  ...strapiI18nTools,
  ...strapiComponentsTools,
  ...strapiSingleTypeTools,
  ...strapiBulkTools,
];

// Export individual tool collections
export { strapiHealthTools } from "./api/health/strapiHealthTool.ts";
export { strapiContentTypesTools } from "./api/content-types/strapiContentTypesTool.ts";
export { strapiContentTools } from "./api/content/strapiContentTool.ts";
export { strapiUsersTools } from "./api/users/strapiUsersTool.ts";
export { strapiMediaTools } from "./api/media/strapiMediaTool.ts";
export { strapiRolesTools } from "./api/roles/strapiRolesTool.ts";
export { strapiPublishTools } from "./api/publish/strapiPublishTool.ts";
export { strapiI18nTools } from "./api/i18n/strapiI18nTool.ts";
export { strapiComponentsTools } from "./api/components/strapiComponentsTool.ts";
export { strapiSingleTypeTools } from "./api/single-type/strapiSingleTypeTool.ts";
export { strapiBulkTools } from "./api/bulk/strapiBulkTool.ts";
