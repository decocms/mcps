/**
 * Google Calendar API constants and configuration
 */

export const GOOGLE_CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3";

// API Endpoints
export const ENDPOINTS = {
  CALENDAR_LIST: `${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`,
  CALENDARS: `${GOOGLE_CALENDAR_API_BASE}/calendars`,
  EVENTS: (calendarId: string) =>
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
  EVENT: (calendarId: string, eventId: string) =>
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  QUICK_ADD: (calendarId: string) =>
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/quickAdd`,
  FREEBUSY: `${GOOGLE_CALENDAR_API_BASE}/freeBusy`,
};

// Default calendar ID
export const PRIMARY_CALENDAR = "primary";

// Default pagination
export const DEFAULT_MAX_RESULTS = 50;

// Event colors (Google Calendar color IDs)
export const EVENT_COLORS = {
  LAVENDER: "1",
  SAGE: "2",
  GRAPE: "3",
  FLAMINGO: "4",
  BANANA: "5",
  TANGERINE: "6",
  PEACOCK: "7",
  GRAPHITE: "8",
  BLUEBERRY: "9",
  BASIL: "10",
  TOMATO: "11",
} as const;

// Event visibility options
export const EVENT_VISIBILITY = {
  DEFAULT: "default",
  PUBLIC: "public",
  PRIVATE: "private",
  CONFIDENTIAL: "confidential",
} as const;

// Event status
export const EVENT_STATUS = {
  CONFIRMED: "confirmed",
  TENTATIVE: "tentative",
  CANCELLED: "cancelled",
} as const;

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  CALENDAR: "https://www.googleapis.com/auth/calendar",
  CALENDAR_EVENTS: "https://www.googleapis.com/auth/calendar.events",
} as const;
