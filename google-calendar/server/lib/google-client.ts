/**
 * Google Calendar API client
 * Handles all communication with the Google Calendar API
 */

import {
  ENDPOINTS,
  DEFAULT_MAX_RESULTS,
  PRIMARY_CALENDAR,
} from "../constants.ts";
import type {
  Calendar,
  CalendarListEntry,
  CalendarListResponse,
  CreateCalendarInput,
  CreateEventInput,
  Event,
  EventsListResponse,
  FreeBusyRequest,
  FreeBusyResponse,
  ListEventsInput,
  UpdateEventInput,
} from "./types.ts";

export interface GoogleCalendarClientConfig {
  accessToken: string;
}

export class GoogleCalendarClient {
  private accessToken: string;

  constructor(config: GoogleCalendarClientConfig) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Google Calendar API error: ${response.status} - ${error}`,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // ==================== Calendar Methods ====================

  /**
   * List all calendars for the authenticated user
   */
  async listCalendars(
    pageToken?: string,
    maxResults: number = DEFAULT_MAX_RESULTS,
  ): Promise<CalendarListResponse> {
    const url = new URL(ENDPOINTS.CALENDAR_LIST);
    url.searchParams.set("maxResults", String(maxResults));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    return this.request<CalendarListResponse>(url.toString());
  }

  /**
   * Get a specific calendar by ID
   */
  async getCalendar(calendarId: string): Promise<CalendarListEntry> {
    const url = `${ENDPOINTS.CALENDAR_LIST}/${encodeURIComponent(calendarId)}`;
    return this.request<CalendarListEntry>(url);
  }

  /**
   * Create a new calendar
   */
  async createCalendar(input: CreateCalendarInput): Promise<Calendar> {
    return this.request<Calendar>(ENDPOINTS.CALENDARS, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * Delete a calendar
   */
  async deleteCalendar(calendarId: string): Promise<void> {
    const url = `${ENDPOINTS.CALENDARS}/${encodeURIComponent(calendarId)}`;
    await this.request<void>(url, { method: "DELETE" });
  }

  // ==================== Event Methods ====================

  /**
   * List events from a calendar
   */
  async listEvents(input: ListEventsInput = {}): Promise<EventsListResponse> {
    const calendarId = input.calendarId || PRIMARY_CALENDAR;
    const url = new URL(ENDPOINTS.EVENTS(calendarId));

    if (input.timeMin) url.searchParams.set("timeMin", input.timeMin);
    if (input.timeMax) url.searchParams.set("timeMax", input.timeMax);
    if (input.maxResults)
      url.searchParams.set("maxResults", String(input.maxResults));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    if (input.q) url.searchParams.set("q", input.q);
    if (input.singleEvents !== undefined)
      url.searchParams.set("singleEvents", String(input.singleEvents));
    if (input.orderBy) url.searchParams.set("orderBy", input.orderBy);
    if (input.showDeleted !== undefined)
      url.searchParams.set("showDeleted", String(input.showDeleted));

    return this.request<EventsListResponse>(url.toString());
  }

  /**
   * Get a specific event by ID
   */
  async getEvent(calendarId: string, eventId: string): Promise<Event> {
    const url = ENDPOINTS.EVENT(calendarId || PRIMARY_CALENDAR, eventId);
    return this.request<Event>(url);
  }

  /**
   * Create a new event
   */
  async createEvent(input: CreateEventInput): Promise<Event> {
    const calendarId = input.calendarId || PRIMARY_CALENDAR;
    const url = new URL(ENDPOINTS.EVENTS(calendarId));

    if (input.sendUpdates) {
      url.searchParams.set("sendUpdates", input.sendUpdates);
    }
    if (input.conferenceDataVersion !== undefined) {
      url.searchParams.set(
        "conferenceDataVersion",
        String(input.conferenceDataVersion),
      );
    }

    const {
      calendarId: _,
      sendUpdates: __,
      conferenceDataVersion: ___,
      ...eventData
    } = input;

    return this.request<Event>(url.toString(), {
      method: "POST",
      body: JSON.stringify(eventData),
    });
  }

  /**
   * Update an existing event
   */
  async updateEvent(input: UpdateEventInput): Promise<Event> {
    const { calendarId, eventId, sendUpdates, ...eventData } = input;
    const url = new URL(
      ENDPOINTS.EVENT(calendarId || PRIMARY_CALENDAR, eventId),
    );

    if (sendUpdates) {
      url.searchParams.set("sendUpdates", sendUpdates);
    }

    return this.request<Event>(url.toString(), {
      method: "PATCH",
      body: JSON.stringify(eventData),
    });
  }

  /**
   * Delete an event
   */
  async deleteEvent(
    calendarId: string,
    eventId: string,
    sendUpdates?: "all" | "externalOnly" | "none",
  ): Promise<void> {
    const url = new URL(
      ENDPOINTS.EVENT(calendarId || PRIMARY_CALENDAR, eventId),
    );

    if (sendUpdates) {
      url.searchParams.set("sendUpdates", sendUpdates);
    }

    await this.request<void>(url.toString(), { method: "DELETE" });
  }

  /**
   * Quick add event using natural language
   */
  async quickAddEvent(
    calendarId: string,
    text: string,
    sendUpdates?: "all" | "externalOnly" | "none",
  ): Promise<Event> {
    const url = new URL(ENDPOINTS.QUICK_ADD(calendarId || PRIMARY_CALENDAR));
    url.searchParams.set("text", text);

    if (sendUpdates) {
      url.searchParams.set("sendUpdates", sendUpdates);
    }

    return this.request<Event>(url.toString(), { method: "POST" });
  }

  // ==================== FreeBusy Methods ====================

  /**
   * Check free/busy information for calendars
   */
  async getFreeBusy(request: FreeBusyRequest): Promise<FreeBusyResponse> {
    return this.request<FreeBusyResponse>(ENDPOINTS.FREEBUSY, {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // ==================== Advanced Methods ====================

  /**
   * Move an event to a different calendar
   */
  async moveEvent(
    sourceCalendarId: string,
    eventId: string,
    destinationCalendarId: string,
    sendUpdates?: "all" | "externalOnly" | "none",
  ): Promise<Event> {
    const url = new URL(`${ENDPOINTS.EVENT(sourceCalendarId, eventId)}/move`);
    url.searchParams.set("destination", destinationCalendarId);

    if (sendUpdates) {
      url.searchParams.set("sendUpdates", sendUpdates);
    }

    return this.request<Event>(url.toString(), { method: "POST" });
  }

  /**
   * Find available time slots across multiple calendars
   * Returns periods where all specified calendars are free
   */
  async findAvailableSlots(
    calendarIds: string[],
    timeMin: string,
    timeMax: string,
    slotDurationMinutes: number,
    timeZone?: string,
  ): Promise<Array<{ start: string; end: string }>> {
    // Get free/busy info for all calendars
    const freeBusyResponse = await this.getFreeBusy({
      timeMin,
      timeMax,
      timeZone,
      items: calendarIds.map((id) => ({ id })),
    });

    // Merge all busy periods
    const allBusyPeriods: Array<{ start: Date; end: Date }> = [];
    for (const calendarData of Object.values(freeBusyResponse.calendars)) {
      for (const busy of calendarData.busy) {
        allBusyPeriods.push({
          start: new Date(busy.start),
          end: new Date(busy.end),
        });
      }
    }

    // Sort by start time
    allBusyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Merge overlapping busy periods
    const mergedBusy: Array<{ start: Date; end: Date }> = [];
    for (const period of allBusyPeriods) {
      if (mergedBusy.length === 0) {
        mergedBusy.push(period);
      } else {
        const last = mergedBusy[mergedBusy.length - 1];
        if (period.start <= last.end) {
          // Overlapping, extend the end
          last.end = new Date(
            Math.max(last.end.getTime(), period.end.getTime()),
          );
        } else {
          mergedBusy.push(period);
        }
      }
    }

    // Find free slots
    const availableSlots: Array<{ start: string; end: string }> = [];
    const rangeStart = new Date(timeMin);
    const rangeEnd = new Date(timeMax);
    const slotDurationMs = slotDurationMinutes * 60 * 1000;

    let currentStart = rangeStart;

    for (const busy of mergedBusy) {
      // Check if there's a gap before this busy period
      if (busy.start > currentStart) {
        const gapEnd = busy.start;
        // Find slots in this gap
        let slotStart = currentStart;
        while (slotStart.getTime() + slotDurationMs <= gapEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + slotDurationMs);
          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
          slotStart = slotEnd;
        }
      }
      currentStart = new Date(
        Math.max(currentStart.getTime(), busy.end.getTime()),
      );
    }

    // Check for slots after the last busy period
    if (currentStart < rangeEnd) {
      let slotStart = currentStart;
      while (slotStart.getTime() + slotDurationMs <= rangeEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotDurationMs);
        availableSlots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
        slotStart = slotEnd;
      }
    }

    return availableSlots;
  }
}

// Re-export getGoogleAccessToken from env.ts for convenience
export { getGoogleAccessToken as getAccessToken } from "./env.ts";
