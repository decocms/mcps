/**
 * Google Calendar API types
 */

export type CalendarAccessRole =
  | "freeBusyReader"
  | "reader"
  | "writer"
  | "owner";

export interface CalendarListEntry {
  kind: "calendar#calendarListEntry";
  etag: string;
  id: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
  summaryOverride?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  hidden?: boolean;
  selected?: boolean;
  accessRole: CalendarAccessRole;
  defaultReminders?: Reminder[];
  primary?: boolean;
  deleted?: boolean;
}

export interface Calendar {
  kind: "calendar#calendar";
  etag: string;
  id: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
}

export interface Event {
  kind: "calendar#event";
  etag: string;
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  htmlLink?: string;
  created?: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  creator?: {
    id?: string;
    email?: string;
    displayName?: string;
    self?: boolean;
  };
  organizer?: {
    id?: string;
    email?: string;
    displayName?: string;
    self?: boolean;
  };
  start: EventDateTime;
  end: EventDateTime;
  endTimeUnspecified?: boolean;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: EventDateTime;
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  iCalUID?: string;
  sequence?: number;
  attendees?: Attendee[];
  attendeesOmitted?: boolean;
  hangoutLink?: string;
  conferenceData?: ConferenceData;
  reminders?: {
    useDefault: boolean;
    overrides?: Reminder[];
  };
}

export interface EventDateTime {
  date?: string; // For all-day events (YYYY-MM-DD)
  dateTime?: string; // For timed events (RFC3339)
  timeZone?: string;
}

export interface Attendee {
  id?: string;
  email: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
  resource?: boolean;
  optional?: boolean;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  comment?: string;
  additionalGuests?: number;
}

export interface Reminder {
  method: "email" | "popup";
  minutes: number;
}

export interface ConferenceData {
  createRequest?: {
    requestId: string;
    conferenceSolutionKey?: {
      type: string;
    };
    status?: {
      statusCode: string;
    };
  };
  entryPoints?: Array<{
    entryPointType: string;
    uri: string;
    label?: string;
    pin?: string;
    accessCode?: string;
    meetingCode?: string;
    passcode?: string;
    password?: string;
  }>;
  conferenceSolution?: {
    key: {
      type: string;
    };
    name: string;
    iconUri: string;
  };
  conferenceId?: string;
}

export interface CalendarListResponse {
  kind: "calendar#calendarList";
  etag: string;
  nextPageToken?: string;
  nextSyncToken?: string;
  items: CalendarListEntry[];
}

export interface EventsListResponse {
  kind: "calendar#events";
  etag: string;
  summary: string;
  description?: string;
  updated: string;
  timeZone: string;
  accessRole: CalendarAccessRole;
  nextPageToken?: string;
  nextSyncToken?: string;
  items: Event[];
}

export interface FreeBusyRequest {
  timeMin: string;
  timeMax: string;
  timeZone?: string;
  groupExpansionMax?: number;
  calendarExpansionMax?: number;
  items: Array<{ id: string }>;
}

export interface FreeBusyResponse {
  kind: "calendar#freeBusy";
  timeMin: string;
  timeMax: string;
  calendars: {
    [calendarId: string]: {
      errors?: Array<{ domain: string; reason: string }>;
      busy: Array<{ start: string; end: string }>;
    };
  };
}

export interface CreateEventInput {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: EventDateTime;
  end: EventDateTime;
  attendees?: Array<{
    email: string;
    displayName?: string;
    optional?: boolean;
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Reminder[];
  };
  colorId?: string;
  visibility?: "default" | "public" | "private" | "confidential";
  sendUpdates?: "all" | "externalOnly" | "none";
  conferenceDataVersion?: 0 | 1;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  calendarId: string;
  eventId: string;
}

export interface ListEventsInput {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  pageToken?: string;
  q?: string;
  singleEvents?: boolean;
  orderBy?: "startTime" | "updated";
  showDeleted?: boolean;
}

export interface CreateCalendarInput {
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
}
