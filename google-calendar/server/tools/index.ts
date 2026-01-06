/**
 * Central export point for all Google Calendar tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools:
 * - calendarTools: Calendar management (list, get, create, delete)
 * - eventTools: Event management (list, get, create, update, delete, quick_add)
 * - freebusyTools: Availability checking (get_freebusy)
 * - advancedTools: Advanced operations (move_event, find_available_slots, duplicate_event)
 */

import { calendarTools } from "./calendars.ts";
import { eventTools } from "./events.ts";
import { freebusyTools } from "./freebusy.ts";
import { advancedTools } from "./advanced.ts";

// Export all tools from all modules
export const tools = [
  // Calendar management tools
  ...calendarTools,
  // Event management tools
  ...eventTools,
  // Free/busy availability tools
  ...freebusyTools,
  // Advanced tools
  ...advancedTools,
];
