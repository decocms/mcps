/**
 * Google Workspace MCP Prompts
 *
 * Two kinds:
 *
 * 1. Agent guides (no arguments) — long-form references the agent pulls on
 *    demand. Cover tool selection, query syntax, and pitfalls per service.
 * 2. User templates (with arguments) — slash-command-style entries the user
 *    picks from the prompt menu. Each expands into a user message that drives
 *    the agent through a common workflow.
 */

import { createPrompt } from "@decocms/runtime";
import { z } from "zod";

const agentGuidePrompt = createPrompt({
  name: "GOOGLE_WORKSPACE_AGENT_GUIDE",
  title: "Google Workspace Agent — Main Instructions",
  description:
    "Entry-point prompt covering all 8 services in this MCP, the tool naming convention, time/timezone handling, destructive-action rules and re-auth signals.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "I just connected to the Google Workspace MCP. How should I operate?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# Google Workspace Agent — Main Instructions

You are an agent backed by the **Google Workspace MCP**, a single connection covering eight Google productivity services through one OAuth login:

| Service | Tool prefix | What's there |
|---|---|---|
| Calendar | \`calendar_*\` | Events, scheduling, free/busy |
| Gmail | \`gmail_*\` | Read, label, draft (no send via MCP — drafts only) |
| Drive | \`drive_*\` | Files, folders, permissions |
| Docs | \`docs_*\` | Create, read, edit documents |
| Sheets | \`sheets_*\` | Read/write spreadsheets, formulas, formatting |
| Slides | \`slides_*\` | Create and edit presentations |
| Forms | \`forms_*\` | Build forms, read responses |
| Meet | \`meet_*\` | Create and manage meeting spaces |

A single OAuth flow grants access to every service.

---

## 1. Picking a service

| User intent | Service |
|---|---|
| "What's on my calendar?", "schedule meeting" | calendar |
| "Find/triage/draft email", "label thread" | gmail |
| "Find file X", "list recent files", "share/copy" | drive |
| "Edit doc", "summarize document" | docs (read content) or drive (find first) |
| "Read/write spreadsheet", "calculate" | sheets |
| "Create presentation" | slides |
| "Build a form", "see responses" | forms |
| "Create a Meet link" | meet |

When in doubt, retrieve the per-service guide via \`prompts/get\`.

---

## 2. Time and timezone handling

Tools that accept timestamps want ISO 8601 **with explicit offset**. Never assume UTC silently.

\`\`\`text
✅  2026-04-24T14:00:00-03:00
✅  2026-04-24T17:00:00Z
❌  2026-04-24T14:00:00       (naive — backend may misinterpret)
\`\`\`

For wall-clock times, attach the user's timezone offset.

---

## 3. Identity defaults

- The user's **own** identifier is implicit in most tools (Calendar's \`primary\`, Gmail's authenticated account, Drive's "my files").
- For meetings/emails that need the user's email (e.g. signature, attendee list, body of an event), look it up via \`drive_get_about\` or one of the user-info tools — don't ask the user.

---

## 4. Destructive actions: confirm first

These tools mutate or delete user data. Confirm before invoking unless the user explicitly authorized the change in the same turn:

- Calendar: \`calendar_create_event\`, \`calendar_update_event\`, \`calendar_delete_event\`, \`calendar_quick_add_event\`, advanced ops (move/duplicate)
- Gmail: \`gmail_create_draft\`, \`gmail_label_thread\`/\`unlabel_thread\`, \`gmail_create_label\`
- Drive: \`drive_create_*\`, \`drive_copy_*\`, \`drive_delete_*\`, \`drive_share_*\`
- Docs/Sheets/Slides/Forms: any \`create_*\`, \`update_*\`, \`delete_*\` (most of these mutate)
- Meet: \`meet_create_space\`, \`meet_end_active_conference\`

> **Gmail caveat:** there is no \`gmail_send\` tool — only \`gmail_create_draft\`. Composed emails land in the user's drafts folder. Never claim "I sent the email."

---

## 5. Pagination

Tools that return lists (\`list_events\`, \`search_threads\`, \`list_recent_files\`, ...) typically expose \`pageSize\` and a token field (\`pageToken\` / \`nextPageToken\`). Default page sizes are small (10–50). For "show me everything" requests, loop with the returned token until empty — but cap loops to avoid runaway fan-out.

---

## 6. Errors and re-auth

If a call returns \`401 Unauthorized\` or "the access token has been revoked", the user must re-authenticate. Surface that explicitly — don't retry. \`403 Forbidden\` usually means the token is missing a scope; ask the user to reconnect to grant the new permission.

---

## 7. Further reading

Pull the per-service guide before doing real work in any one service. Each guide has a tool cheat sheet, common workflows, query syntax (when applicable), and pitfalls. Available:

- \`GOOGLE_WORKSPACE_CALENDAR_GUIDE\`
- \`GOOGLE_WORKSPACE_GMAIL_GUIDE\`
- \`GOOGLE_WORKSPACE_DRIVE_GUIDE\`
- \`GOOGLE_WORKSPACE_DOCS_GUIDE\`
- \`GOOGLE_WORKSPACE_SHEETS_GUIDE\`
- \`GOOGLE_WORKSPACE_SLIDES_GUIDE\`
- \`GOOGLE_WORKSPACE_FORMS_GUIDE\`
- \`GOOGLE_WORKSPACE_MEET_GUIDE\`
`,
        },
      },
    ],
  }),
});

/**
 * Per-service guide factory — keeps the per-service prompts short and
 * uniform: tool list + key pitfalls. Exhaustive cheat sheets are intentionally
 * left to each tool's own description (which the agent already sees).
 */
function serviceGuide(opts: {
  name: string;
  title: string;
  prefix: string;
  description: string;
  body: string;
}) {
  return createPrompt({
    name: opts.name,
    title: opts.title,
    description: opts.description,
    execute: () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `How do I use the ${opts.prefix}_* tools?`,
          },
        },
        {
          role: "assistant" as const,
          content: { type: "text" as const, text: opts.body },
        },
      ],
    }),
  });
}

const calendarGuidePrompt = serviceGuide({
  name: "GOOGLE_WORKSPACE_CALENDAR_GUIDE",
  title: "Google Calendar — Tool Guide",
  prefix: "calendar",
  description:
    "Calendar tool selection, the `primary` calendar convention, scheduling workflows and recurring-event pitfalls.",
  body: `# Google Calendar — Tool Guide

## Core tools
- \`calendar_list_calendars\` — discover the user's calendars (primary, secondary, shared).
- \`calendar_list_events\` — most common read; takes time window + optional search.
- \`calendar_get_event\` — fetch one event by ID after a list/search.
- \`calendar_get_freebusy\` — busy/free intervals for one or more calendars.
- \`calendar_quick_add_event\` — natural-language one-liner ("Lunch tomorrow at noon").
- \`calendar_create_event\` / \`calendar_update_event\` / \`calendar_delete_event\` — explicit CRUD.
- \`calendar_find_available_slots\` — multi-attendee slot finder.
- \`calendar_move_event\` / \`calendar_duplicate_event\` — advanced.

## Conventions
- Use \`"primary"\` as the default calendar id.
- Times are ISO 8601 **with timezone offset**; pass the user's tz unless they say otherwise.
- Recurring events are a single object — updating "the standup" updates every instance unless you target a specific instance id.

## Pitfalls
- Free/busy for outside-the-org emails returns empty data.
- \`update_event\` overwrites the fields you pass; read first if you're only changing one thing.
- \`quick_add\` ignores attendees — use \`create_event\` when you need to invite people.`,
});

const gmailGuidePrompt = serviceGuide({
  name: "GOOGLE_WORKSPACE_GMAIL_GUIDE",
  title: "Gmail — Tool Guide",
  prefix: "gmail",
  description:
    "Gmail tool selection, search syntax, thread vs message ops, and the drafts-only caveat (this MCP cannot send mail).",
  body: `# Gmail — Tool Guide

> **No send tool.** This MCP only creates drafts. The user clicks Send themselves. Never promise to "send" an email.

## Core tools
- \`gmail_search_messages\` / \`gmail_search_threads\` — Gmail's search syntax (see below).
- \`gmail_get_message\` / \`gmail_get_thread\` — fetch full content by id.
- \`gmail_create_draft\` — compose a draft (reply if you pass \`threadId\`).
- \`gmail_list_drafts\`, \`gmail_get_draft\`, \`gmail_update_draft\`, \`gmail_delete_draft\`.
- \`gmail_list_labels\`, \`gmail_create_label\`, \`gmail_label_thread\`, \`gmail_unlabel_thread\`, \`gmail_label_message\`, \`gmail_unlabel_message\`.

## Search syntax cheat sheet
\`\`\`text
from:bob@example.com
to:me
subject:"Q1 review"
label:starred              (or label:INBOX, label:UNREAD, etc.)
is:unread, is:important, is:starred
has:attachment, has:link
after:2026/04/01           (yyyy/mm/dd, NOT ISO 8601)
newer_than:7d              (d, m, y)
from:bob OR from:alice -label:archived
"connection refused"       (phrase)
\`\`\`

## System label ids
\`INBOX\`, \`SENT\`, \`DRAFT\`, \`TRASH\`, \`SPAM\`, \`STARRED\`, \`UNREAD\`, \`IMPORTANT\`, \`CHAT\` — use these directly. For custom labels, call \`gmail_list_labels\` first to resolve the id.

## Pitfalls
- Threads vs. messages — most ops should target the thread.
- Custom labels need ids, not display names.
- "Archive" = remove the \`INBOX\` label.
- Drafts in a thread require the \`threadId\` to stay attached to the conversation.`,
});

const driveGuidePrompt = serviceGuide({
  name: "GOOGLE_WORKSPACE_DRIVE_GUIDE",
  title: "Google Drive — Tool Guide",
  prefix: "drive",
  description:
    "Drive tool selection, structured query syntax, MIME types, and content vs. metadata vs. permissions.",
  body: `# Google Drive — Tool Guide

## Core tools
- \`drive_list_files\` — search via Drive's structured query language.
- \`drive_get_file\` — metadata + URLs for a single file.
- \`drive_export_file\` — natural-language extraction (Docs/Sheets/PDFs/etc.).
- \`drive_download_file\` — raw bytes (base64).
- \`drive_create_file\`, \`drive_copy_file\`, \`drive_update_file\`, \`drive_delete_file\`.
- \`drive_list_folders\`, \`drive_create_folder\`, \`drive_move_file\`.
- \`drive_list_permissions\`, \`drive_create_permission\`, \`drive_delete_permission\`.

## Query syntax
\`\`\`text
name contains 'budget'
mimeType = 'application/pdf'
modifiedTime > '2026-04-01T00:00:00'
'<folderId>' in parents
trashed = false
sharedWithMe and modifiedTime > '2026-04-01T00:00:00'
fullText contains 'security incident'
\`\`\`

## MIME types you'll need
| Type | MIME |
|---|---|
| Google Doc | \`application/vnd.google-apps.document\` |
| Google Sheet | \`application/vnd.google-apps.spreadsheet\` |
| Google Slides | \`application/vnd.google-apps.presentation\` |
| Google Form | \`application/vnd.google-apps.form\` |
| Folder | \`application/vnd.google-apps.folder\` |
| PDF | \`application/pdf\` |

## Pitfalls
- \`name contains\` is a substring match (case-insensitive). Use \`fullText\` for content.
- Add \`trashed = false\` to skip the bin.
- Prefer \`drive_export_file\` over \`drive_download_file\` for "summarize this" — it returns clean text. Download only when you need raw bytes.
- For deeper editing of Docs/Sheets/Slides/Forms, hand off to the matching service-specific tools instead of \`drive_update_file\`.`,
});

const docsGuidePrompt = serviceGuide({
  name: "GOOGLE_WORKSPACE_DOCS_GUIDE",
  title: "Google Docs — Tool Guide",
  prefix: "docs",
  description:
    "Tools for creating and editing Google Docs (titles, body content, batch updates).",
  body: `# Google Docs — Tool Guide

## Core tools
- \`docs_create_document\` — start a new doc with a title.
- \`docs_get_document\` — read full structure (paragraphs, tables, lists, embedded objects).
- \`docs_batch_update\` — apply one or many text/format/table operations atomically.

## When to use Drive vs. Docs
- "Find a doc" / "summarize a doc" → \`drive_list_files\` then \`drive_export_file\`.
- "Edit a doc" / "insert text" / "format" → \`docs_get_document\` then \`docs_batch_update\`.

## Pitfalls
- \`docs_batch_update\` uses **1-indexed positions** referring to the doc's structural index. Read the doc with \`get_document\` first to find the right insertion index — guessing produces shifted text.
- Edits are atomic per request: if any sub-operation fails, the entire batch is rolled back.`,
});

const sheetsGuidePrompt = serviceGuide({
  name: "GOOGLE_WORKSPACE_SHEETS_GUIDE",
  title: "Google Sheets — Tool Guide",
  prefix: "sheets",
  description:
    "Tools for reading/writing spreadsheets — values, ranges, formulas, formatting, batch updates.",
  body: `# Google Sheets — Tool Guide

## Core areas
- Read values: \`sheets_get_values\`, \`sheets_batch_get_values\`.
- Write values: \`sheets_update_values\`, \`sheets_append_values\`, \`sheets_clear_values\`, \`sheets_batch_update_values\`.
- Spreadsheet meta: \`sheets_get_spreadsheet\`, \`sheets_create_spreadsheet\`, \`sheets_batch_update\`.
- Sheet ops (tabs): add, delete, copy, rename via \`sheets_batch_update\` requests.
- Formatting and formulas via \`sheets_batch_update\` request types.

## Conventions
- Ranges use A1 notation: \`Sheet1!A1:B10\`, \`'My Tab'!A:A\`.
- For appends, set \`valueInputOption: "USER_ENTERED"\` so formulas like \`=SUM(...)\` are evaluated; use \`"RAW"\` to write literal strings.
- For multi-sheet operations, batch them in a single \`sheets_batch_update\` rather than serial calls.

## Pitfalls
- Empty trailing cells are not returned in value reads — pad client-side if you need a fixed shape.
- Sheet names with spaces/special chars must be quoted in A1 ranges.
- Formulas referencing external sheets require the user to have access to the other file.`,
});

const slidesGuidePrompt = serviceGuide({
  name: "GOOGLE_WORKSPACE_SLIDES_GUIDE",
  title: "Google Slides — Tool Guide",
  prefix: "slides",
  description: "Tools for creating and editing Google Slides presentations.",
  body: `# Google Slides — Tool Guide

## Core tools
- \`slides_create_presentation\` — new presentation with a title.
- \`slides_get_presentation\` — read all slides, layouts and elements.
- \`slides_get_page\` — read one slide.
- \`slides_batch_update\` — apply create/replace/style operations atomically.

## Common workflows
- New deck from scratch: create_presentation → batch_update with createSlide / insertText / createShape requests.
- Replace placeholder text across slides: batch_update with \`replaceAllText\`.
- Insert images: \`createImage\` referencing a Drive file or public URL.

## Pitfalls
- Element IDs are required for most updates — get them via \`get_presentation\` first.
- Layouts (\`TITLE\`, \`TITLE_AND_BODY\`, etc.) define placeholders; use the placeholder id when inserting text rather than creating fresh shapes.`,
});

const formsGuidePrompt = serviceGuide({
  name: "GOOGLE_WORKSPACE_FORMS_GUIDE",
  title: "Google Forms — Tool Guide",
  prefix: "forms",
  description:
    "Tools for creating Google Forms, configuring questions, and reading responses.",
  body: `# Google Forms — Tool Guide

## Core tools
- \`forms_create_form\` — empty form with a title; questions added via batch_update.
- \`forms_get_form\` — read the structure (sections, items, options).
- \`forms_batch_update\` — add/edit/remove items, reorder, change settings.
- \`forms_list_responses\`, \`forms_get_response\` — read submissions.

## Conventions
- Questions are \`item\` objects with a \`questionItem\` payload. Types: choice, text, scale, date, time, file upload, etc.
- For multi-page forms, use \`pageBreakItem\`.
- Quizzes set \`isQuiz\` on the form and \`grading\` on individual questions.

## Pitfalls
- Once responses exist, certain edits (like changing answer options on a question with submitted answers) may invalidate prior data — read existing responses before destructive edits.
- The form's "edit URL" and "respond URL" are different; surface the right one when sharing.`,
});

const meetGuidePrompt = serviceGuide({
  name: "GOOGLE_WORKSPACE_MEET_GUIDE",
  title: "Google Meet — Tool Guide",
  prefix: "meet",
  description:
    "Tools for creating and managing Google Meet spaces and conferences.",
  body: `# Google Meet — Tool Guide

## Core tools
- \`meet_create_space\` — new persistent meeting space (returns the meeting URL and \`name\`).
- \`meet_get_space\`, \`meet_update_space\` — inspect / change access settings.
- \`meet_end_active_conference\` — kick everyone out of the current conference in a space.
- \`meet_list_conference_records\`, \`meet_get_conference_record\` — historical metadata for past conferences.
- \`meet_list_participants\`, \`meet_list_recordings\`, \`meet_list_transcripts\` — post-meeting artifacts.

## Common workflows
- "Schedule a meeting with Bob": call \`meet_create_space\` to get a URL, then \`calendar_create_event\` with that URL in the description / conferenceData.
- "What did we cover in yesterday's call?" → conference records + transcripts (only if recording/transcription was on).

## Pitfalls
- Spaces are persistent; the same space can host many conferences over time. Don't conflate "space" with "meeting".
- Recording/transcript availability depends on the user's Workspace tier and admin policy.`,
});

// ============================================================================
// User templates — picked from the prompt menu, accept arguments
// ============================================================================

const userMessage = (text: string) => ({
  messages: [
    {
      role: "user" as const,
      content: { type: "text" as const, text },
    },
  ],
});

const morningBriefing = createPrompt({
  name: "morning_briefing",
  title: "Morning briefing",
  description:
    "Summarize the day ahead — calendar, important unread email, and recent Drive activity — in one shot.",
  execute: () =>
    userMessage(
      `Give me a morning briefing for today. Combine three sources:

1. **Calendar** — \`calendar_list_events\` on \`primary\` from now until end of day in my timezone. Group as: meetings I'm hosting, meetings I'm attending, blocked focus time.
2. **Email** — \`gmail_search_threads\` with \`is:unread is:important newer_than:1d\`. Show subject, sender, one-line summary. Cap at 10.
3. **Drive activity** — \`drive_list_files\` for \`modifiedTime > '<24h ago>' and trashed = false\`, top 5. Surface anything shared with me or that I last touched.

Format as three short sections with bullets. End with one sentence: "What should I tackle first?"`,
    ),
});

const prepForMeeting = createPrompt({
  name: "prep_for_meeting",
  title: "Prep for next meeting",
  description:
    "Pull together context for the next meeting on the calendar — attendees, recent emails with them, shared docs.",
  argsSchema: {
    lookahead: z
      .string()
      .optional()
      .describe(
        "How far ahead to look for the next meeting (e.g. '60m', '4h'). Default '4h'.",
      ),
  },
  execute: ({ args }) => {
    const lookahead = args.lookahead ?? "4h";
    return userMessage(
      `Prep me for my next meeting in the next ${lookahead}.

1. \`calendar_list_events\` on \`primary\` from now until ${lookahead} from now. Pick the next event with at least one attendee besides me.
2. For each attendee email, \`gmail_search_threads\` with \`from:<email> OR to:<email> newer_than:14d\` and pull the latest 3 threads each. Highlight open questions or commitments.
3. \`drive_list_files\` for files modified by those people in the last 30 days OR shared in those email threads. List up to 5.
4. \`gmail_search_threads\` with the meeting title — surface any prior agenda emails / meeting notes.

Output: meeting title and time, attendee list, 5 bullets of context, suggested talking points.`,
    );
  },
});

const whatsOnCalendar = createPrompt({
  name: "whats_on_calendar",
  title: "What's on my calendar",
  description: "Summarize the schedule for a given window. Defaults to today.",
  argsSchema: {
    when: z
      .string()
      .optional()
      .describe(
        "Window to summarize. e.g. 'today', 'tomorrow', 'this week', '2026-04-24'. Default 'today'.",
      ),
  },
  execute: ({ args }) => {
    const when = args.when ?? "today";
    return userMessage(
      `Summarize what's on my calendar for: ${when}.

1. Resolve the window to ISO 8601 timestamps in my local timezone (always include offset).
2. \`calendar_list_events\` on \`primary\` for that window.
3. Group by day. For each event: time, title, attendee count, location/Meet link. Flag conflicts.
4. End with: total meeting hours and the longest free block per day.`,
    );
  },
});

const findMeetingTime = createPrompt({
  name: "find_meeting_time",
  title: "Find a time to meet",
  description:
    "Find a slot when the given attendees are all free, within the user's organization.",
  argsSchema: {
    attendees: z
      .string()
      .describe(
        "Comma-separated emails. Always include 'primary' to represent me.",
      ),
    duration: z
      .string()
      .optional()
      .describe("Duration. e.g. '30m', '1h'. Default '30m'."),
    when: z
      .string()
      .optional()
      .describe(
        "Time window to search. e.g. 'today', 'this week', 'next 5 business days'. Default 'next 5 business days'.",
      ),
  },
  execute: ({ args }) => {
    const duration = args.duration ?? "30m";
    const when = args.when ?? "the next 5 business days";
    return userMessage(
      `Find a ${duration} meeting slot when these people are all free during ${when}: ${args.attendees}.

1. Resolve the time window into ISO 8601 with my timezone offset.
2. \`calendar_find_available_slots\` (or \`calendar_get_freebusy\` if the former isn't available) with the attendee emails, duration, and window.
3. Return up to 5 candidate slots in my tz. For each, note any caveats (e.g. attendee outside org → no free/busy data).
4. Ask which slot to book — do NOT call \`calendar_create_event\` until I confirm.`,
    );
  },
});

const blockFocusTime = createPrompt({
  name: "block_focus_time",
  title: "Block focus time",
  description: "Reserve a focus block on the user's primary calendar.",
  argsSchema: {
    duration: z
      .string()
      .describe("Duration of the focus block. e.g. '90m', '2h'."),
    when: z
      .string()
      .optional()
      .describe(
        "When to block. e.g. 'tomorrow morning', 'today 14:00 GMT-3', 'next free slot today'. Default 'next free slot today'.",
      ),
    title: z.string().optional().describe("Block title. Default 'Focus time'."),
  },
  execute: ({ args }) => {
    const when = args.when ?? "the next free slot today";
    const title = args.title ?? "Focus time";
    return userMessage(
      `Block ${args.duration} of focus time on my calendar for: "${title}". When: ${when}.

1. Resolve "${when}" into a concrete start (ISO 8601 with my timezone). For "next free slot", \`calendar_list_events\` first and pick the earliest gap of at least ${args.duration}.
2. Show me proposed start/end and ask for confirmation.
3. **After I confirm**, \`calendar_create_event\` on \`primary\` with summary "${title}", visibility "private", no attendees.
4. Confirm the event was created and show me the link.`,
    );
  },
});

const inboxTriage = createPrompt({
  name: "inbox_triage",
  title: "Triage my inbox",
  description: "Summarize unread email by importance and what needs a reply.",
  argsSchema: {
    timeframe: z
      .string()
      .optional()
      .describe(
        "How far back to look. e.g. 'today', '24h', '3d'. Default '24h'.",
      ),
  },
  execute: ({ args }) => {
    const timeframe = args.timeframe ?? "24h";
    const newerThan =
      timeframe.endsWith("h") || timeframe.endsWith("d")
        ? `newer_than:${timeframe.replace(/\s/g, "")}`
        : "newer_than:1d";
    return userMessage(
      `Triage my Gmail inbox for the last ${timeframe}.

1. \`gmail_search_threads\` with \`is:unread ${newerThan} -category:promotions -category:social\`.
2. For each thread, \`gmail_get_thread\` and classify as:
   - **Reply needed** — direct question or @-mention
   - **FYI** — informational, no action
   - **Action item** — task assigned to me
   - **Noise** — newsletters, automated
3. Output a table: From, Subject, Class, One-line gist.
4. End with: how many need a reply, and which 1–3 are most time-sensitive. Don't draft replies — just triage.`,
    );
  },
});

const draftReply = createPrompt({
  name: "draft_reply",
  title: "Draft an email reply",
  description:
    "Find an email thread and create a draft reply. The user reviews and sends it themselves.",
  argsSchema: {
    thread_query: z
      .string()
      .describe(
        "Gmail search query to locate the thread. e.g. 'from:bob renewal', 'subject:Q1 review'.",
      ),
    instruction: z
      .string()
      .describe("What to say in the reply, in your own words."),
  },
  execute: ({ args }) =>
    userMessage(
      `Draft a reply to a Gmail thread.

1. \`gmail_search_threads\` with: \`${args.thread_query}\`. If multiple match, pick the most recent and tell me which.
2. \`gmail_get_thread\` to read the latest message.
3. Compose a reply that says: ${args.instruction}
   - Match the existing tone.
   - Keep it concise unless the original was long.
   - Sign off with my first name.
4. \`gmail_create_draft\` with the threadId so it stays in the conversation.
5. Tell me where to find the draft. **Remember: this MCP cannot send mail — I must click Send.**`,
    ),
});

const findFiles = createPrompt({
  name: "find_files",
  title: "Find files in Drive",
  description: "Search Google Drive with structured filters.",
  argsSchema: {
    query: z
      .string()
      .describe(
        "Natural-language description. e.g. 'PDFs about Q1 budget from this year', 'spreadsheets shared by Alice last month'.",
      ),
  },
  execute: ({ args }) =>
    userMessage(
      `Find files in my Drive matching: ${args.query}.

1. Translate the request to Drive structured query syntax. Examples:
   - PDFs → \`mimeType = 'application/pdf'\`
   - Sheets → \`mimeType = 'application/vnd.google-apps.spreadsheet'\`
   - "this year" → \`modifiedTime > 'YYYY-01-01T00:00:00'\`
   - Always add \`trashed = false\`.
2. \`drive_list_files\` with the structured query.
3. List up to 10 results: title, type, owner, last modified. Include the file id.`,
    ),
});

const summarizeDoc = createPrompt({
  name: "summarize_doc",
  title: "Summarize a document",
  description:
    "Find a Drive document by name and produce a concise summary of its content.",
  argsSchema: {
    document: z
      .string()
      .describe(
        "Document name or keyword. The agent confirms before summarizing.",
      ),
  },
  execute: ({ args }) =>
    userMessage(
      `Summarize a document from my Drive: ${args.document}.

1. \`drive_list_files\` with \`name contains '${args.document}' and trashed = false\`. If multiple, list the top 3 with last-modified dates and ask me to pick.
2. \`drive_export_file\` on the chosen file (preferred over download — handles Docs/Sheets/PDFs).
3. Produce: 3-sentence executive summary, bullet list of key points (max 7), open questions/TODOs.
4. End with the doc URL.`,
    ),
});

const newDeck = createPrompt({
  name: "new_deck_from_outline",
  title: "Create a slide deck from an outline",
  description:
    "Generate a Google Slides deck from a bullet outline. Confirms before mutating.",
  argsSchema: {
    title: z.string().describe("Deck title."),
    outline: z
      .string()
      .describe(
        "Bullet outline. One slide per top-level bullet; nested bullets are speaker notes.",
      ),
  },
  execute: ({ args }) =>
    userMessage(
      `Create a Google Slides deck titled "${args.title}" from this outline:

${args.outline}

Steps:
1. \`slides_create_presentation\` with the title.
2. Parse the outline: each top-level bullet = one slide; nested bullets = speaker notes.
3. \`slides_batch_update\` with createSlide + insertText requests in one batch.
4. Show me the deck URL when done.

Confirm with me before step 3 if the outline is ambiguous (e.g. inconsistent indentation).`,
    ),
});

const createForm = createPrompt({
  name: "create_form",
  title: "Build a form from a question list",
  description:
    "Create a Google Form with the given title and questions. Confirms before mutating.",
  argsSchema: {
    title: z.string().describe("Form title."),
    questions: z
      .string()
      .describe(
        "One question per line. Prefix with type: 'short:', 'long:', 'choice:', 'multi:', 'scale:1-5'. Default short text.",
      ),
  },
  execute: ({ args }) =>
    userMessage(
      `Build a Google Form titled "${args.title}" with these questions:

${args.questions}

Steps:
1. \`forms_create_form\` with the title.
2. Parse each line into the right item type:
   - \`short:Q\` → SHORT_ANSWER
   - \`long:Q\` → PARAGRAPH
   - \`choice:Q | A | B | C\` → RADIO with three options
   - \`multi:Q | A | B | C\` → CHECKBOX
   - \`scale:1-5 Q\` → linear scale 1–5
   - bare line → SHORT_ANSWER
3. \`forms_batch_update\` with all items in one batch.
4. Show me the form's edit URL and respond URL.

Confirm before step 3 if any line is ambiguous.`,
    ),
});

const meetingLink = createPrompt({
  name: "create_meet_for_event",
  title: "Add a Meet link to a calendar event",
  description:
    "Create a Google Meet space and attach it to an existing or new calendar event.",
  argsSchema: {
    event_query: z
      .string()
      .describe(
        "Either 'new' to create an event, or a calendar search to find one (e.g. 'Q1 sync this Friday').",
      ),
  },
  execute: ({ args }) =>
    userMessage(
      `Create a Google Meet space and attach it to a calendar event: ${args.event_query}.

1. \`meet_create_space\` to get a Meet URL.
2. If "${args.event_query}" is "new":
   - Ask me for title, attendees, time. Then \`calendar_create_event\` with the Meet URL in the description.
3. Otherwise, \`calendar_list_events\` with the query, pick the matching event, then \`calendar_update_event\` to add the Meet URL.
4. Confirm the event was updated and show me the Meet URL.`,
    ),
});

export const prompts = [
  // Agent guides
  agentGuidePrompt,
  calendarGuidePrompt,
  gmailGuidePrompt,
  driveGuidePrompt,
  docsGuidePrompt,
  sheetsGuidePrompt,
  slidesGuidePrompt,
  formsGuidePrompt,
  meetGuidePrompt,
  // User templates
  morningBriefing,
  prepForMeeting,
  whatsOnCalendar,
  findMeetingTime,
  blockFocusTime,
  inboxTriage,
  draftReply,
  findFiles,
  summarizeDoc,
  newDeck,
  createForm,
  meetingLink,
];
