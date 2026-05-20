/**
 * Meeting tools — create and manage Teams meetings via the Graph Calendar API.
 *
 * A "meeting" here is a calendar event (/me/events). Setting is_online_meeting
 * attaches a Microsoft Teams join link. Invitation responses (accept / decline /
 * tentative) and rescheduling are also handled here.
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getAccessToken } from "../lib/auth.ts";
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  cancelEvent,
  respondToEvent,
  type GraphEvent,
} from "../lib/graph-client.ts";
import { toErrorResponse } from "../lib/errors.ts";

function token(env: Env): string {
  return getAccessToken(env);
}

const DEFAULT_TZ = "UTC";

// Reusable schema fragments
const dateTimeField = z
  .string()
  .describe(
    "Local date-time in ISO format WITHOUT offset, e.g. '2026-05-21T15:00:00'. Pair it with time_zone.",
  );

const attendeeSchema = z.object({
  address: z.string().describe("Attendee email address."),
  name: z.string().optional().describe("Attendee display name."),
  optional: z
    .boolean()
    .optional()
    .describe("Mark as optional attendee (default required)."),
});

const errorFields = {
  error: z.string().nullish(),
  error_code: z.string().nullish(),
  error_hint: z.string().nullish(),
  request_id: z.string().nullish(),
};

/** Strip HTML to plain text (Graph returns the meeting body as HTML). */
function bodyToPlainText(body?: {
  contentType: string;
  content: string;
}): string | null {
  if (!body?.content) return null;
  if (body.contentType?.toLowerCase() === "text") return body.content.trim();
  return body.content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Project a Graph event into a compact, agent-friendly shape. */
function mapEvent(e: GraphEvent) {
  return {
    id: e.id,
    subject: e.subject ?? null,
    start: e.start?.dateTime ?? null,
    end: e.end?.dateTime ?? null,
    time_zone: e.start?.timeZone ?? null,
    organizer: e.organizer?.emailAddress?.address ?? null,
    attendees:
      e.attendees?.map((a) => ({
        email: a.emailAddress.address,
        name: a.emailAddress.name ?? null,
        type: a.type ?? null,
        response: a.status?.response ?? null,
      })) ?? [],
    location: e.location?.displayName ?? null,
    is_online_meeting: e.isOnlineMeeting ?? false,
    join_url: e.onlineMeeting?.joinUrl ?? null,
    web_link: e.webLink ?? null,
    is_cancelled: e.isCancelled ?? false,
    my_response: e.responseStatus?.response ?? null,
    // Graph's auto-truncated snippet
    preview: e.bodyPreview ?? null,
    // Full meeting description (HTML stripped to plain text)
    description: bodyToPlainText(e.body),
  };
}

const meetingOutputShape = {
  id: z.string(),
  subject: z.string().nullish(),
  start: z.string().nullish(),
  end: z.string().nullish(),
  time_zone: z.string().nullish(),
  organizer: z.string().nullish(),
  attendees: z
    .array(
      z.object({
        email: z.string(),
        name: z.string().nullish(),
        type: z.string().nullish(),
        response: z.string().nullish(),
      }),
    )
    .optional(),
  location: z.string().nullish(),
  is_online_meeting: z.boolean().nullish(),
  join_url: z.string().nullish(),
  web_link: z.string().nullish(),
  is_cancelled: z.boolean().nullish(),
  my_response: z.string().nullish(),
  preview: z.string().nullish(),
  description: z.string().nullish(),
};

// ─── CREATE_MEETING ───────────────────────────────────────────────────────────

export const createCreateMeetingTool = (env: Env) =>
  createTool({
    id: "CREATE_MEETING",
    description:
      "Create a calendar meeting and (by default) attach a Microsoft Teams " +
      "join link. Provide subject, start/end (local date-time + time_zone), " +
      "and optional attendees by email. Returns the meeting id and the Teams " +
      "join_url. Set is_online_meeting=false for a plain calendar event with " +
      "no Teams link.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        subject: z.string().describe("Meeting title."),
        start: dateTimeField,
        end: dateTimeField,
        time_zone: z
          .string()
          .default(DEFAULT_TZ)
          .describe("IANA time zone, e.g. 'America/Sao_Paulo'. Default UTC."),
        attendees: z
          .array(attendeeSchema)
          .optional()
          .describe("People to invite."),
        body_html: z
          .string()
          .optional()
          .describe("Optional meeting description (HTML allowed)."),
        location: z.string().optional().describe("Optional location name."),
        is_online_meeting: z
          .boolean()
          .default(true)
          .describe("Attach a Teams join link (default true)."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      meeting: z.object(meetingOutputShape).nullish(),
      ...errorFields,
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        subject: string;
        start: string;
        end: string;
        time_zone?: string;
        attendees?: { address: string; name?: string; optional?: boolean }[];
        body_html?: string;
        location?: string;
        is_online_meeting?: boolean;
      };
      try {
        const tz = input.time_zone ?? DEFAULT_TZ;
        const event = await createEvent(
          {
            subject: input.subject,
            start: { dateTime: input.start, timeZone: tz },
            end: { dateTime: input.end, timeZone: tz },
            attendees: input.attendees,
            bodyHtml: input.body_html,
            locationName: input.location,
            isOnlineMeeting: input.is_online_meeting ?? true,
          },
          token(env),
        );
        return { success: true, meeting: mapEvent(event) };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── LIST_MEETINGS ────────────────────────────────────────────────────────────

export const createListMeetingsTool = (env: Env) =>
  createTool({
    id: "LIST_MEETINGS",
    description:
      "List upcoming calendar meetings. Pass start and end (ISO date-times) to " +
      "query a window (expands recurring meetings); omit them to list the next " +
      "events on the calendar. Returns id, subject, time, attendees, join_url, " +
      "and your response status.",
    annotations: {
      destructiveHint: false,
      openWorldHint: true,
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        start: z
          .string()
          .optional()
          .describe(
            "Window start, ISO date-time (e.g. '2026-05-20T00:00:00Z').",
          ),
        end: z.string().optional().describe("Window end, ISO date-time."),
        top: z
          .number()
          .default(20)
          .describe("Max meetings to return (default 20)."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      meetings: z.array(z.object(meetingOutputShape)).optional(),
      ...errorFields,
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { start, end, top } = context as {
        start?: string;
        end?: string;
        top?: number;
      };
      try {
        const events = await listEvents(token(env), { start, end, top });
        return { success: true, meetings: events.map(mapEvent) };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── GET_MEETING ──────────────────────────────────────────────────────────────

export const createGetMeetingTool = (env: Env) =>
  createTool({
    id: "GET_MEETING",
    description:
      "Get full details of a single meeting by id, including attendees, their " +
      "response statuses, the Teams join_url, and the body preview.",
    annotations: {
      destructiveHint: false,
      openWorldHint: true,
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        meeting_id: z.string().describe("Calendar event / meeting id."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      meeting: z.object(meetingOutputShape).nullish(),
      ...errorFields,
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { meeting_id } = context as { meeting_id: string };
      try {
        const event = await getEvent(meeting_id, token(env));
        if (!event) {
          return {
            success: false,
            error: `Meeting not found: ${meeting_id}`,
            error_code: "NotFound",
          };
        }
        return { success: true, meeting: mapEvent(event) };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── UPDATE_MEETING ───────────────────────────────────────────────────────────

export const createUpdateMeetingTool = (env: Env) =>
  createTool({
    id: "UPDATE_MEETING",
    description:
      "Edit an existing meeting you organize — change subject, body, location, " +
      "or attendees. To RESCHEDULE, use RESCHEDULE_MEETING (or pass new start/end " +
      "here). Only fields you provide are changed.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        meeting_id: z.string().describe("Calendar event / meeting id."),
        subject: z.string().optional().describe("New title."),
        start: z.string().optional().describe("New start date-time."),
        end: z.string().optional().describe("New end date-time."),
        time_zone: z
          .string()
          .default(DEFAULT_TZ)
          .describe("Time zone for start/end if provided."),
        attendees: z
          .array(attendeeSchema)
          .optional()
          .describe("Replace the attendee list."),
        body_html: z.string().optional().describe("New description (HTML)."),
        location: z.string().optional().describe("New location name."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      meeting: z.object(meetingOutputShape).nullish(),
      ...errorFields,
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        meeting_id: string;
        subject?: string;
        start?: string;
        end?: string;
        time_zone?: string;
        attendees?: { address: string; name?: string; optional?: boolean }[];
        body_html?: string;
        location?: string;
      };
      try {
        const tz = input.time_zone ?? DEFAULT_TZ;
        const event = await updateEvent(
          input.meeting_id,
          {
            subject: input.subject,
            start: input.start
              ? { dateTime: input.start, timeZone: tz }
              : undefined,
            end: input.end ? { dateTime: input.end, timeZone: tz } : undefined,
            attendees: input.attendees,
            bodyHtml: input.body_html,
            locationName: input.location,
          },
          token(env),
        );
        return { success: true, meeting: mapEvent(event) };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── RESCHEDULE_MEETING ───────────────────────────────────────────────────────

export const createRescheduleMeetingTool = (env: Env) =>
  createTool({
    id: "RESCHEDULE_MEETING",
    description:
      "Move a meeting you organize to a new time. Provide the new start and end " +
      "(local date-time + time_zone). Attendees are automatically notified of the " +
      "update.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        meeting_id: z.string().describe("Calendar event / meeting id."),
        start: dateTimeField,
        end: dateTimeField,
        time_zone: z
          .string()
          .default(DEFAULT_TZ)
          .describe("IANA time zone for the new start/end. Default UTC."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      meeting: z.object(meetingOutputShape).nullish(),
      ...errorFields,
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        meeting_id: string;
        start: string;
        end: string;
        time_zone?: string;
      };
      try {
        const tz = input.time_zone ?? DEFAULT_TZ;
        const event = await updateEvent(
          input.meeting_id,
          {
            start: { dateTime: input.start, timeZone: tz },
            end: { dateTime: input.end, timeZone: tz },
          },
          token(env),
        );
        return { success: true, meeting: mapEvent(event) };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── CANCEL_MEETING ───────────────────────────────────────────────────────────

export const createCancelMeetingTool = (env: Env) =>
  createTool({
    id: "CANCEL_MEETING",
    description:
      "Cancel a meeting you ORGANIZE — sends a cancellation notice to all " +
      "attendees and removes it from their calendars. Use DELETE_MEETING " +
      "instead to silently remove an event from only your own calendar.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: z
      .object({
        meeting_id: z.string().describe("Calendar event / meeting id."),
        comment: z
          .string()
          .optional()
          .describe("Optional message included in the cancellation notice."),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean(), ...errorFields }),
    execute: async ({ context }: { context: unknown }) => {
      const { meeting_id, comment } = context as {
        meeting_id: string;
        comment?: string;
      };
      try {
        await cancelEvent(meeting_id, comment, token(env));
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── DELETE_MEETING ───────────────────────────────────────────────────────────

export const createDeleteMeetingTool = (env: Env) =>
  createTool({
    id: "DELETE_MEETING",
    description:
      "Remove a meeting from YOUR calendar without notifying anyone. For " +
      "meetings you organize, prefer CANCEL_MEETING so attendees are informed.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: z
      .object({
        meeting_id: z.string().describe("Calendar event / meeting id."),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean(), ...errorFields }),
    execute: async ({ context }: { context: unknown }) => {
      const { meeting_id } = context as { meeting_id: string };
      try {
        await deleteEvent(meeting_id, token(env));
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── ACCEPT_MEETING ───────────────────────────────────────────────────────────

export const createAcceptMeetingTool = (env: Env) =>
  createTool({
    id: "ACCEPT_MEETING",
    description:
      "Accept a meeting invitation. Optionally include a comment that is sent " +
      "to the organizer.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        meeting_id: z.string().describe("Calendar event / meeting id."),
        comment: z
          .string()
          .optional()
          .describe("Optional reply to the organizer."),
        send_response: z
          .boolean()
          .default(true)
          .describe("Whether to notify the organizer (default true)."),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean(), ...errorFields }),
    execute: async ({ context }: { context: unknown }) => {
      const { meeting_id, comment, send_response } = context as {
        meeting_id: string;
        comment?: string;
        send_response?: boolean;
      };
      try {
        await respondToEvent(meeting_id, "accept", token(env), {
          comment,
          sendResponse: send_response ?? true,
        });
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── DECLINE_MEETING ──────────────────────────────────────────────────────────

export const createDeclineMeetingTool = (env: Env) =>
  createTool({
    id: "DECLINE_MEETING",
    description:
      "Decline a meeting invitation. Optionally propose a new time " +
      "(proposed_start / proposed_end + time_zone) so the organizer can " +
      "reschedule, and optionally include a comment.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        meeting_id: z.string().describe("Calendar event / meeting id."),
        comment: z
          .string()
          .optional()
          .describe("Optional reply to the organizer."),
        send_response: z
          .boolean()
          .default(true)
          .describe("Whether to notify the organizer (default true)."),
        proposed_start: z
          .string()
          .optional()
          .describe("Optional proposed new start date-time."),
        proposed_end: z
          .string()
          .optional()
          .describe("Optional proposed new end date-time."),
        time_zone: z
          .string()
          .default(DEFAULT_TZ)
          .describe("Time zone for the proposed times."),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean(), ...errorFields }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        meeting_id: string;
        comment?: string;
        send_response?: boolean;
        proposed_start?: string;
        proposed_end?: string;
        time_zone?: string;
      };
      try {
        const tz = input.time_zone ?? DEFAULT_TZ;
        const proposedNewTime =
          input.proposed_start && input.proposed_end
            ? {
                start: { dateTime: input.proposed_start, timeZone: tz },
                end: { dateTime: input.proposed_end, timeZone: tz },
              }
            : undefined;
        await respondToEvent(input.meeting_id, "decline", token(env), {
          comment: input.comment,
          sendResponse: input.send_response ?? true,
          proposedNewTime,
        });
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── TENTATIVELY_ACCEPT_MEETING ───────────────────────────────────────────────

export const createTentativelyAcceptMeetingTool = (env: Env) =>
  createTool({
    id: "TENTATIVELY_ACCEPT_MEETING",
    description:
      "Respond 'tentative' (maybe) to a meeting invitation. Optionally propose " +
      "a new time and include a comment.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        meeting_id: z.string().describe("Calendar event / meeting id."),
        comment: z
          .string()
          .optional()
          .describe("Optional reply to the organizer."),
        send_response: z
          .boolean()
          .default(true)
          .describe("Whether to notify the organizer (default true)."),
        proposed_start: z
          .string()
          .optional()
          .describe("Optional proposed new start date-time."),
        proposed_end: z
          .string()
          .optional()
          .describe("Optional proposed new end date-time."),
        time_zone: z
          .string()
          .default(DEFAULT_TZ)
          .describe("Time zone for the proposed times."),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean(), ...errorFields }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        meeting_id: string;
        comment?: string;
        send_response?: boolean;
        proposed_start?: string;
        proposed_end?: string;
        time_zone?: string;
      };
      try {
        const tz = input.time_zone ?? DEFAULT_TZ;
        const proposedNewTime =
          input.proposed_start && input.proposed_end
            ? {
                start: { dateTime: input.proposed_start, timeZone: tz },
                end: { dateTime: input.proposed_end, timeZone: tz },
              }
            : undefined;
        await respondToEvent(
          input.meeting_id,
          "tentativelyAccept",
          token(env),
          {
            comment: input.comment,
            sendResponse: input.send_response ?? true,
            proposedNewTime,
          },
        );
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

export const meetingTools = [
  createCreateMeetingTool,
  createListMeetingsTool,
  createGetMeetingTool,
  createUpdateMeetingTool,
  createRescheduleMeetingTool,
  createCancelMeetingTool,
  createDeleteMeetingTool,
  createAcceptMeetingTool,
  createDeclineMeetingTool,
  createTentativelyAcceptMeetingTool,
];
