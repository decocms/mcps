/**
 * Google Workspace MCP Prompts
 *
 * Two kinds of prompts:
 *
 * 1. Agent guides (no arguments) — long-form references the agent pulls on
 *    demand: tool catalog, search syntax, pitfalls. Exposed via `prompts/get`
 *    when the agent decides it needs the docs for a service.
 *
 * 2. User templates (arguments) — slash-command-style entries the user picks
 *    from the prompt menu in their MCP client. Each one expands into a user
 *    message that drives the agent through a common day-to-day workflow.
 *
 * The tool catalog itself comes from Google's upstream MCPs and lives in
 * `server/tools/generated/`. Re-run `bun run generate-tools` whenever Google
 * ships a new tool — the prompts below should stay hand-curated.
 */

import { createPrompt } from "@decocms/runtime";
import { z } from "zod";

const agentGuidePrompt = createPrompt({
  name: "GOOGLE_WORKSPACE_AGENT_GUIDE",
  title: "Google Workspace Agent — Main Instructions",
  description:
    "Entry-point system prompt for an agent using the Google Workspace MCP. Lists the wrapped services, the tool naming convention, the auth model, and points at per-service guides.",
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

You are an agent backed by the **Google Workspace MCP**, a single connection that fans out to five of Google's official MCP servers:

| Service | Backend | Tool prefix |
|---|---|---|
| Calendar | \`calendarmcp.googleapis.com\` | \`calendar_*\` |
| Chat | \`chatmcp.googleapis.com\` | \`chat_*\` |
| Drive | \`drivemcp.googleapis.com\` | \`drive_*\` |
| Gmail | \`gmailmcp.googleapis.com\` | \`gmail_*\` |
| People | \`people.googleapis.com\` | \`people_*\` |

A single OAuth login covers every service — when the user authenticates, you get access to all 33 tools at once.

---

## 1. Picking a service

| User intent | Service to use |
|---|---|
| "What's on my calendar?", "schedule a meeting", "block 30 min" | **calendar** |
| "Send/list/search emails", "label this thread", "create draft" | **gmail** |
| "Find file X", "share doc", "list recent files" | **drive** |
| "Post to space Y", "search messages in chat" | **chat** |
| "Look up person", "what's my email", "find colleague" | **people** |

When in doubt, retrieve the per-service prompt below for the exact tool set:

- \`GOOGLE_WORKSPACE_CALENDAR_GUIDE\`
- \`GOOGLE_WORKSPACE_GMAIL_GUIDE\`
- \`GOOGLE_WORKSPACE_DRIVE_GUIDE\`
- \`GOOGLE_WORKSPACE_CHAT_GUIDE\`
- \`GOOGLE_WORKSPACE_PEOPLE_GUIDE\`

---

## 2. Time and timezone handling

Calendar, Gmail and Chat tools accept ISO 8601 timestamps. **Always include an explicit timezone offset** (\`-03:00\`, \`Z\`, etc.) when the user names a wall-clock time — never silently assume UTC.

\`\`\`text
✅  2026-04-24T14:00:00-03:00
✅  2026-04-24T17:00:00Z
❌  2026-04-24T14:00:00       (naive — backend may misinterpret)
\`\`\`

Date-only inputs (\`2026-04-24\`) are usually treated as UTC midnight by the backends.

---

## 3. Identity defaults

- The user's **own** identifier in most tools is implicit (e.g. Calendar's "primary" calendar, Gmail's authenticated account). You do **not** need to look up the user's email before calling those tools.
- When you do need it (e.g. for a meeting body, an attendee list, a signature), call \`people_get_user_profile\` — cheap, returns name + email.

---

## 4. Destructive actions: confirm first

These tools mutate or delete user data. Confirm with the user before invoking unless they explicitly authorized the change in this turn:

- \`calendar_delete_event\`, \`calendar_update_event\`, \`calendar_respond_to_event\`
- \`gmail_label_thread\`, \`gmail_unlabel_thread\`, \`gmail_label_message\`, \`gmail_unlabel_message\`, \`gmail_create_label\`, \`gmail_create_draft\`
- \`drive_create_file\`, \`drive_copy_file\`
- \`chat_send_message\`

> **Gmail caveat**: there is **no \`gmail_send\` tool** — only \`create_draft\`. Composed emails land in the user's drafts folder for them to review and send manually. Make sure the user knows this before promising "I'll send the email."

---

## 5. Pagination

Tools that return lists (\`list_events\`, \`search_threads\`, \`list_recent_files\`, \`list_messages\`, \`search_directory_people\`, …) typically expose a \`pageSize\` and a page-token field (\`pageToken\` / \`nextPageToken\`). Default page sizes are small (often 10–50). For "show me everything" requests, loop with the returned token until empty — but cap the loops to avoid runaway fan-out.

---

## 6. Errors and re-auth

If a call returns \`401 Unauthorized\` or \`The access token has been revoked\`, the user needs to re-authenticate. Surface that explicitly — don't retry. \`403 Forbidden\` usually means the token is missing a scope; ask the user to reconnect to grant the new permission.

---

## 7. Further reading

Pull the per-service guide before doing real work in any one service. Each guide includes a tool cheat sheet, common workflows, query syntax (when applicable), and pitfalls. Retrieve via the standard MCP \`prompts/get\` request.
`,
        },
      },
    ],
  }),
});

const calendarGuidePrompt = createPrompt({
  name: "GOOGLE_WORKSPACE_CALENDAR_GUIDE",
  title: "Google Calendar — Tool Guide",
  description:
    "Practical guide for the calendar_* tools: tool selection, scheduling workflows, time-range syntax, the primary calendar convention, and pitfalls.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "How do I use the calendar_* tools?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# Google Calendar — Tool Guide

## Tools (8)

| Tool | When to use |
|---|---|
| \`calendar_list_calendars\` | Discover which calendars the user has — primary, secondary, shared. |
| \`calendar_list_events\` | "What's on my schedule from X to Y?" Most common read tool. |
| \`calendar_get_event\` | Fetch a single event by ID (after a list/search). |
| \`calendar_suggest_time\` | "Find a 30-min slot when A, B and C are all free next week." |
| \`calendar_create_event\` | Schedule a new meeting. |
| \`calendar_update_event\` | Move, rename, change attendees on an existing event. |
| \`calendar_delete_event\` | Remove an event (destructive — confirm first). |
| \`calendar_respond_to_event\` | Accept / decline / tentative an invitation. |

## Calendar IDs

- The user's main calendar is identified as **\`"primary"\`** — use this as the default for any "my calendar" request.
- Secondary calendars use email-shaped IDs (e.g. \`team@group.calendar.google.com\`). Get them via \`calendar_list_calendars\`.

## Time syntax

All times must be ISO 8601 **with an explicit offset**:

\`\`\`json
{
  "calendarId": "primary",
  "startTime": "2026-04-24T09:00:00-03:00",
  "endTime":   "2026-04-24T18:00:00-03:00"
}
\`\`\`

Don't compute epoch ms by hand — pass the ISO string and let Google's backend resolve it.

## Common workflows

### "What's on my calendar tomorrow?"
\`\`\`json
{ "tool": "calendar_list_events",
  "input": { "calendarId": "primary",
             "startTime": "<tomorrow 00:00 user-tz>",
             "endTime":   "<tomorrow 23:59 user-tz>" } }
\`\`\`

### "Find 30 min next week with Bob and Alice"
\`\`\`json
{ "tool": "calendar_suggest_time",
  "input": { "attendee_emails": ["primary","bob@x.com","alice@y.com"],
             "duration_minutes": 30,
             "earliest_start_time": "...",
             "latest_end_time":   "..." } }
\`\`\`
Note: \`primary\` works as a special attendee value to include the user themselves.

### "Reschedule the standup to 10am"
1. \`calendar_list_events\` to find the standup → grab its \`id\`.
2. \`calendar_update_event\` with the new \`startTime\` / \`endTime\`.

### "Decline that meeting"
\`calendar_respond_to_event\` with \`responseStatus: "declined"\`.

## Pitfalls

1. **Recurring events are a single object.** Updating "the standup" updates **every** instance unless you target the specific instance ID. Make sure the user wants that.
2. **\`updateEvent\` overwrites fields you pass.** Read first if you're only changing one thing — partial updates require sending the whole event.
3. **Timezones are sticky.** If the user's calendar timezone is \`America/Sao_Paulo\` but you create with \`+00:00\`, the event will appear at the wrong wall-clock hour. Match the user's tz unless they say otherwise.
4. **\`primary\` is implicit.** Don't ask "which calendar?" if the user just says "my calendar" — use \`primary\`.
5. **\`suggest_time\` only works inside the user's organization.** Free/busy data for outside emails won't be available.
`,
        },
      },
    ],
  }),
});

const gmailGuidePrompt = createPrompt({
  name: "GOOGLE_WORKSPACE_GMAIL_GUIDE",
  title: "Gmail — Tool Guide",
  description:
    "Practical guide for the gmail_* tools: tool selection, Gmail search query syntax, label vs thread vs message, and pitfalls. Important: this MCP cannot send mail — only create drafts.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "How do I use the gmail_* tools?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# Gmail — Tool Guide

> **Up front: this MCP cannot send email.** There is no \`gmail_send_message\`. The closest tool is \`gmail_create_draft\`, which leaves the message in the user's drafts folder for them to review and click "Send" themselves. Always set this expectation before promising to "send" anything.

## Tools (10)

| Tool | When to use |
|---|---|
| \`gmail_search_threads\` | "Find emails about X", "show me unread from Bob". The main read tool. |
| \`gmail_get_thread\` | After a search, fetch the full conversation by thread ID. |
| \`gmail_create_draft\` | Compose a reply or new email — leaves it in Drafts for the user. |
| \`gmail_list_drafts\` | Show what's in Drafts. |
| \`gmail_list_labels\` | Discover label IDs (you must look up an ID before label/unlabel ops). |
| \`gmail_create_label\` | New custom label. |
| \`gmail_label_thread\` / \`gmail_unlabel_thread\` | Apply/remove labels at the thread level. |
| \`gmail_label_message\` / \`gmail_unlabel_message\` | Same, at the single-message level. |

## Gmail search query syntax

\`gmail_search_threads\` accepts the **same query syntax as the Gmail web UI search box**.

| Operator | Example | Meaning |
|---|---|---|
| \`from:\` | \`from:bob@example.com\` | From that sender |
| \`to:\` | \`to:me\` | Sent to that address |
| \`subject:\` | \`subject:"Q1 review"\` | Subject contains phrase |
| \`label:\` | \`label:starred\` | Has that label (system or custom) |
| \`is:\` | \`is:unread\`, \`is:important\`, \`is:starred\` | State |
| \`has:\` | \`has:attachment\` | Filter by attachment / link / etc. |
| \`after:\` / \`before:\` | \`after:2026/04/01 before:2026/04/15\` | Date range (note: \`yyyy/mm/dd\`) |
| \`newer_than:\` | \`newer_than:7d\` | Relative time (\`d\`, \`m\`, \`y\`) |
| \`OR\` / \`-\` | \`from:bob OR from:alice -label:archived\` | Boolean / exclusion |
| \`{}\` | \`{from:bob from:alice}\` | OR shorthand |
| \`""\` | \`"connection refused"\` | Phrase match |

Combine freely:

\`\`\`text
from:billing@vendor.com after:2026/03/01 has:attachment -label:archived
is:unread label:inbox -from:noreply@
\`\`\`

## System label IDs

These are well-known and work without calling \`list_labels\`:

\`INBOX\`, \`SENT\`, \`DRAFT\`, \`TRASH\`, \`SPAM\`, \`STARRED\`, \`UNREAD\`, \`IMPORTANT\`, \`CHAT\`.

For **custom labels**, call \`gmail_list_labels\` first to get the ID — the label name alone won't work.

## Common workflows

### "Find emails about the renewal from billing@vendor.com last 30 days"
\`\`\`json
{ "tool": "gmail_search_threads",
  "input": { "query": "from:billing@vendor.com renewal newer_than:30d" } }
\`\`\`

### "Reply to the latest message in that thread"
1. \`gmail_get_thread\` → grab the latest message's \`id\` and \`Message-ID\` header.
2. \`gmail_create_draft\` with \`threadId\` to keep it in the conversation.
3. **Tell the user** the draft is in Drafts — they need to send it.

### "Star and label these threads as 'follow-up'"
1. \`gmail_list_labels\` → find the \`follow-up\` label ID (or call \`gmail_create_label\` first if it doesn't exist).
2. \`gmail_label_thread\` with both \`STARRED\` and the custom label ID.

### "Archive everything from this newsletter"
1. \`gmail_search_threads\` with \`from:newsletter@x.com\`.
2. For each thread → \`gmail_unlabel_thread\` removing \`INBOX\` (Gmail's "archive" is just removing the INBOX label).

## Pitfalls

1. **No send tool.** Repeat: this MCP creates drafts only. Never claim an email was sent.
2. **Threads vs messages.** A thread is a conversation; a message is a single email. Most operations should target the thread (\`label_thread\`, \`get_thread\`) unless the user is editing one specific reply.
3. **Custom labels need IDs, not names.** A user-friendly label like "Receipts" has an internal ID like \`Label_1234567890\`. Always resolve via \`gmail_list_labels\` before label/unlabel ops.
4. **Date filters use \`yyyy/mm/dd\`.** Not ISO 8601, not US format. \`after:2026/04/01\`, not \`2026-04-01\`.
5. **\`is:unread\` is per-message, not per-thread.** A thread can be partially unread. \`gmail_search_threads\` returns the thread; check the message states inside.
6. **Drafts in a thread.** When replying, pass \`threadId\` to keep the draft attached to the conversation; otherwise it becomes a new thread.
`,
        },
      },
    ],
  }),
});

const driveGuidePrompt = createPrompt({
  name: "GOOGLE_WORKSPACE_DRIVE_GUIDE",
  title: "Google Drive — Tool Guide",
  description:
    "Practical guide for the drive_* tools: tool selection, search query syntax, content vs metadata, MIME types, and pitfalls.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "How do I use the drive_* tools?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# Google Drive — Tool Guide

## Tools (8)

| Tool | When to use |
|---|---|
| \`drive_search_files\` | "Find a file matching X". Structured query syntax — see below. |
| \`drive_list_recent_files\` | "What did I work on lately?" Sorted by recency / viewed time / modified. |
| \`drive_get_file_metadata\` | Title, owner, size, MIME, parents — without downloading. |
| \`drive_read_file_content\` | Natural-language extraction of the file (works for Docs, Sheets, PDFs, etc.). Use this for "summarize this doc". |
| \`drive_download_file_content\` | Raw bytes as base64. Use for binary files or when you need the original format. |
| \`drive_get_file_permissions\` | "Who has access to this?" |
| \`drive_create_file\` | Upload / create a new file (destructive — confirm). |
| \`drive_copy_file\` | Duplicate an existing file (destructive — confirm). |

## Search query syntax

\`drive_search_files\` uses Google Drive's structured query language:

\`\`\`text
name contains 'budget'
mimeType = 'application/pdf'
modifiedTime > '2026-04-01T00:00:00'
'<folderId>' in parents
trashed = false
sharedWithMe and modifiedTime > '2026-04-01T00:00:00'
\`\`\`

Combine with \`and\` / \`or\`:

\`\`\`text
name contains 'invoice' and mimeType = 'application/pdf' and trashed = false
fullText contains 'security incident' and modifiedTime > '2026-03-01T00:00:00'
\`\`\`

## Common MIME types

| Workspace type | MIME |
|---|---|
| Google Docs | \`application/vnd.google-apps.document\` |
| Google Sheets | \`application/vnd.google-apps.spreadsheet\` |
| Google Slides | \`application/vnd.google-apps.presentation\` |
| Google Forms | \`application/vnd.google-apps.form\` |
| Folder | \`application/vnd.google-apps.folder\` |
| Shortcut | \`application/vnd.google-apps.shortcut\` |
| PDF | \`application/pdf\` |

## Common workflows

### "Find PDFs about Q1 budget from this year"
\`\`\`json
{ "tool": "drive_search_files",
  "input": { "query": "name contains 'budget' and mimeType = 'application/pdf' and modifiedTime > '2026-01-01T00:00:00'" } }
\`\`\`

### "Summarize this Google Doc"
1. \`drive_search_files\` (or use the file ID if the user has it).
2. \`drive_read_file_content\` to get the natural-language extraction.
3. Summarize the returned text.

### "What's in folder X?"
1. Resolve folder ID via \`drive_search_files\` (\`mimeType = 'application/vnd.google-apps.folder' and name = 'X'\`).
2. \`drive_search_files\` with \`'<folderId>' in parents and trashed = false\`.

### "Who has access to this doc?"
\`drive_get_file_permissions\` with the file ID.

## Pitfalls

1. **\`read_file_content\` ≠ \`download_file_content\`.** Use \`read\` for "summarize this", \`download\` for "give me the bytes". Reading a Google Doc as raw bytes returns Drive's internal export format — usually not what you want.
2. **Trashed files match search by default.** Add \`trashed = false\` unless the user wants the bin too.
3. **\`'<folderId>' in parents\` requires the literal folder ID string with quotes.** Not the folder name.
4. **\`drive.file\` scope is sandboxed.** If the OAuth client has only \`drive.file\` (not full \`drive\`), the agent can only see files it created — listings will look empty for everything else.
5. **Download is base64.** Decode before writing; large files will hit token limits in the conversation. For >1MB files, prefer \`read_file_content\` (extracts text) or stream them outside the LLM.
6. **\`name contains\` is case-insensitive but exact substring.** It does not tokenize — \`name contains 'invoices'\` won't match \`Invoice 042\`. Use \`fullText contains\` for content search.
`,
        },
      },
    ],
  }),
});

const chatGuidePrompt = createPrompt({
  name: "GOOGLE_WORKSPACE_CHAT_GUIDE",
  title: "Google Chat — Tool Guide",
  description:
    "Practical guide for the chat_* tools: spaces vs DMs, message search, sending messages, and pitfalls.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "How do I use the chat_* tools?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# Google Chat — Tool Guide

## Tools (4)

| Tool | When to use |
|---|---|
| \`chat_search_conversations\` | Find a Space or DM by display name. The first step of most workflows. |
| \`chat_list_messages\` | Read messages from a specific conversation, time range, or thread. |
| \`chat_search_messages\` | Find messages by keyword across all accessible conversations. |
| \`chat_send_message\` | Post a message (destructive — confirm before posting). |

## Conversation types

Google Chat has three kinds of conversations:

- **Space**: a named multi-person room (think Slack channel).
- **Group DM**: ad-hoc multi-person message thread, no name.
- **DM**: 1-on-1 direct message.

\`chat_search_conversations\` works for **named** ones (Spaces). DMs are usually addressed by the other person's identifier — flow through People MCP to look up the user.

## Common workflows

### "What's been said in #engineering today?"
1. \`chat_search_conversations\` with \`displayName: "engineering"\` → grab the space ID.
2. \`chat_list_messages\` with the space ID and a 24h time window.

### "Find messages about the outage"
\`\`\`json
{ "tool": "chat_search_messages",
  "input": { "query": "outage", "scope": "all" } }
\`\`\`

### "Reply 'yes' in the thread Bob mentioned"
1. \`chat_search_messages\` with the keyword — grab the \`threadId\` of Bob's message.
2. \`chat_send_message\` with the same \`threadId\` to keep the reply threaded.
3. **Confirm with the user before posting** — Chat messages can't be unsent silently.

## Pitfalls

1. **Private (1:1) DMs may not be indexed.** \`chat_list_messages\` excludes messages visible to a single user only — search will not surface them.
2. **\`send_message\` is irreversible.** A posted message is visible immediately; editing/deleting requires a separate flow that this MCP doesn't expose. Always confirm.
3. **Threading matters.** Pass \`threadId\` (or \`threadKey\`) to reply inside an existing thread — without it, the message starts a new thread in the same space.
4. **Scope: read vs modify.** If the OAuth grant has only \`chat.messages.readonly\` / \`chat.spaces.readonly\`, \`send_message\` will fail with 403. Re-auth with the full \`chat.messages\` / \`chat.spaces\` scopes if so.
5. **No bot identity.** Messages are sent **as the authenticated user** — they will see "you" posted it in their Chat history. Make sure the user wants that.
`,
        },
      },
    ],
  }),
});

const peopleGuidePrompt = createPrompt({
  name: "GOOGLE_WORKSPACE_PEOPLE_GUIDE",
  title: "People — Tool Guide",
  description:
    "Practical guide for the people_* tools: directory vs personal contacts, looking up the user themselves, and pitfalls.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "How do I use the people_* tools?",
        },
      },
      {
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: `# People — Tool Guide

## Tools (3)

| Tool | When to use |
|---|---|
| \`people_get_user_profile\` | "What's my name and email?" — info about the authenticated user themselves. |
| \`people_search_directory_people\` | Find a colleague by name within the user's Google Workspace organization. |
| \`people_search_contacts\` | Find someone in the user's personal address book (people they've emailed before, manually-added contacts). |

## Two namespaces

People MCP queries two distinct sources:

| Source | Tool | Available when |
|---|---|---|
| **Workspace directory** | \`search_directory_people\` | The user has a Google Workspace account (work / school). Personal \`@gmail.com\` accounts return nothing here. |
| **Personal contacts** | \`search_contacts\` | Always available, but only contains people the user has interacted with or saved. |

For "find Maria from the design team", \`search_directory_people\` is the right call. For "find my dentist's email", \`search_contacts\` is the right call.

## Common workflows

### "Who am I?"
\`people_get_user_profile\` — returns name + email. Useful before composing emails / events that need the user's identity in the body.

### "Find Bob's email"
1. Try \`people_search_directory_people\` first if the user is on Workspace.
2. Fall back to \`people_search_contacts\` if no match.

### "Schedule a meeting with the engineering team"
1. \`people_search_directory_people\` for each name → resolve to email addresses.
2. Pass the emails into \`calendar_create_event\` as attendees.

## Pitfalls

1. **Directory search returns nothing on personal accounts.** Don't suggest "let me look up your colleague" if the user signed in with \`@gmail.com\` — only \`@<workspace-domain>\` accounts can read the directory.
2. **\`search_contacts\` is incomplete.** It only knows about people the user has saved or interacted with. A first-time recipient won't appear.
3. **Don't loop name lookups.** If the user types out an email already, just use it — don't make a People search call for verification.
4. **Privacy.** Surface as little PII as the task needs. If the user asks "what's Bob's email?", reply with the email and don't dump the entire directory entry.
`,
        },
      },
    ],
  }),
});

// ============================================================================
// User templates — picked from the prompt menu, accept arguments
// ============================================================================
//
// Each template returns a single user-role message instructing the agent.
// The agent then orchestrates calls across the 5 services to fulfill it.

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
    "Summarize the day ahead — calendar, important unread email, and recent chat activity — in one shot.",
  execute: () =>
    userMessage(
      `Give me a morning briefing for today. Use the Google Workspace MCP and combine three sources:

1. **Calendar** — call \`calendar_list_events\` on \`primary\` from now until end of day in my timezone. Group as: meetings I'm hosting, meetings I'm attending, blocked focus time.
2. **Email** — call \`gmail_search_threads\` with \`is:unread is:important newer_than:1d\`. Show subject, sender, one-line summary. Cap at 10.
3. **Chat** — call \`chat_search_messages\` for the last 24h that mention me. Surface the spaces with the most activity.

Format as three short sections with bullets. End with one sentence: "What should I tackle first?"`,
    ),
});

const prepForMeeting = createPrompt({
  name: "prep_for_meeting",
  title: "Prep for next meeting",
  description:
    "Pull together context for the next meeting on the calendar — attendees, recent emails with them, and shared docs.",
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
      `Prep me for my next meeting in the next ${lookahead}. Steps:

1. \`calendar_list_events\` on \`primary\` from now until ${lookahead} from now. Pick the next event with at least one attendee besides me.
2. For each attendee email, \`gmail_search_threads\` with \`from:<email> OR to:<email> newer_than:14d\` and pull the latest 3 threads each. Highlight any open questions or commitments.
3. \`drive_search_files\` for files modified by those people in the last 30 days OR shared in those email threads. List up to 5.
4. \`gmail_search_threads\` with the meeting title as a query — surface any prior meeting notes / agenda emails.

Output: meeting title and time, attendee list with role hints (org, last interaction), 5 bullets of context, suggested talking points.`,
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
        "Window to summarize. Free-form, e.g. 'today', 'tomorrow', 'this week', 'next Monday', '2026-04-24'. Default 'today'.",
      ),
  },
  execute: ({ args }) => {
    const when = args.when ?? "today";
    return userMessage(
      `Summarize what's on my calendar for: ${when}.

1. Resolve the window into ISO 8601 timestamps using my local timezone (always include offset — never naive). If the user said something ambiguous like "this week", interpret as Monday–Sunday in my tz.
2. Call \`calendar_list_events\` on \`primary\` for that window.
3. Group by day. For each event: time, title, attendee count, location/Meet link. Flag conflicts.
4. End with: total meeting hours and longest free block per day.`,
    );
  },
});

const findMeetingTime = createPrompt({
  name: "find_meeting_time",
  title: "Find a time to meet",
  description:
    "Find a slot when given attendees are all free — across the user's organization.",
  argsSchema: {
    attendees: z
      .string()
      .describe(
        "Comma-separated emails (or names — agent will look them up via people_search_directory_people). Always include me as 'primary'.",
      ),
    duration: z
      .string()
      .optional()
      .describe("Duration. e.g. '30m', '1h'. Default '30m'."),
    when: z
      .string()
      .optional()
      .describe(
        "Time window to search. e.g. 'today', 'tomorrow', 'this week', 'next 5 business days'. Default 'next 5 business days'.",
      ),
  },
  execute: ({ args }) => {
    const duration = args.duration ?? "30m";
    const when = args.when ?? "the next 5 business days";
    return userMessage(
      `Find a ${duration} meeting slot when these people are all free during ${when}: ${args.attendees}.

1. For any names that aren't emails, resolve via \`people_search_directory_people\`. Always include \`primary\` to represent me.
2. Resolve the time window into ISO 8601 with my timezone.
3. Call \`calendar_suggest_time\` with the attendee_emails list, duration, and window.
4. Return up to 5 candidate slots (start time in my tz). For each, note which attendees confirmed availability.
5. Ask me which slot to book — do NOT call \`calendar_create_event\` until I confirm.`,
    );
  },
});

const blockFocusTime = createPrompt({
  name: "block_focus_time",
  title: "Block focus time",
  description:
    "Reserve a focus block on the user's primary calendar. Confirms before creating.",
  argsSchema: {
    duration: z
      .string()
      .describe("Duration of the focus block. e.g. '90m', '2h'."),
    when: z
      .string()
      .optional()
      .describe(
        "When to block. e.g. 'tomorrow morning', 'today 14:00 GMT-3', 'next free slot'. Default 'next free slot today'.",
      ),
    title: z.string().optional().describe("Block title. Default 'Focus time'."),
  },
  execute: ({ args }) => {
    const when = args.when ?? "the next free slot today";
    const title = args.title ?? "Focus time";
    return userMessage(
      `Block ${args.duration} of focus time on my calendar for: "${title}". When: ${when}.

1. Resolve "${when}" into a concrete start time (ISO 8601 with my timezone offset). If it says "next free slot", first call \`calendar_list_events\` for the rest of today and pick the earliest gap of at least ${args.duration}.
2. Show me the proposed start/end times and ask for confirmation.
3. **Only after I confirm**, call \`calendar_create_event\` on \`primary\` with:
   - summary: "${title}"
   - the resolved start/end
   - visibility: "private"
   - no attendees
4. Confirm the event was created and show me the link.`,
    );
  },
});

const inboxTriage = createPrompt({
  name: "inbox_triage",
  title: "Triage my inbox",
  description:
    "Summarize unread email by importance and suggest what needs a reply.",
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

1. \`gmail_search_threads\` with: \`is:unread ${newerThan} -category:promotions -category:social\`.
2. For each thread, get the latest message via \`gmail_get_thread\` and classify it as:
   - **Reply needed** — direct question or @-mention
   - **FYI** — informational, no action
   - **Action item** — task assigned to me
   - **Noise** — newsletters, automated, etc.
3. Output a table with columns: From, Subject, Class, One-line gist.
4. End with: how many need a reply, and which 1–3 are the most time-sensitive. Do NOT draft replies yet — just the triage.`,
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

1. \`gmail_search_threads\` with query: \`${args.thread_query}\`. If multiple match, pick the most recent and tell me which one.
2. \`gmail_get_thread\` to read the latest message in that thread.
3. Compose a reply that says: ${args.instruction}
   - Match the existing tone and language.
   - Keep it concise unless the original was long.
   - Sign off with my first name (look it up via \`people_get_user_profile\` if you don't already know it).
4. \`gmail_create_draft\` with the threadId so it stays in the conversation.
5. Tell me where to find the draft. **Remember: this MCP cannot send mail — the user must click Send themselves.**`,
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
        "Natural-language description of what to find. e.g. 'PDFs about Q1 budget from this year', 'spreadsheets shared by Alice last month'.",
      ),
  },
  execute: ({ args }) =>
    userMessage(
      `Find files in my Drive matching: ${args.query}.

1. Translate the request into Drive structured query syntax. Examples:
   - PDFs → \`mimeType = 'application/pdf'\`
   - Sheets → \`mimeType = 'application/vnd.google-apps.spreadsheet'\`
   - "this year" → \`modifiedTime > 'YYYY-01-01T00:00:00'\`
   - "shared by X" → resolve email via \`people_search_directory_people\` then \`'<email>' in owners\`
   - Always add \`trashed = false\` unless the user wants the bin.
2. Call \`drive_search_files\` with the structured query.
3. List up to 10 results: title, type (Doc/Sheet/PDF/…), owner, last modified. Include the file ID for follow-ups.`,
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
        "Document name or keyword. The agent searches Drive and confirms the match before summarizing.",
      ),
  },
  execute: ({ args }) =>
    userMessage(
      `Summarize a document from my Drive: ${args.document}.

1. \`drive_search_files\` with \`name contains '${args.document}' and trashed = false\`. If multiple results, list the top 3 with last-modified dates and ask me to pick.
2. \`drive_read_file_content\` (NOT download) on the chosen file — this returns natural-language extraction that handles Docs/Sheets/PDFs.
3. Produce:
   - 3-sentence executive summary
   - Bullet list of key points (max 7)
   - Open questions / TODOs flagged in the doc
4. End with the doc URL.`,
    ),
});

const catchUpChat = createPrompt({
  name: "catch_up_chat",
  title: "Catch up on a Chat space",
  description: "Summarize recent activity in a Google Chat space or DM.",
  argsSchema: {
    space: z
      .string()
      .describe(
        "Space display name or keyword. e.g. 'engineering', 'design-team'.",
      ),
    timeframe: z
      .string()
      .optional()
      .describe("How far back to read. e.g. '24h', '3d'. Default '24h'."),
  },
  execute: ({ args }) => {
    const timeframe = args.timeframe ?? "24h";
    return userMessage(
      `Catch me up on the "${args.space}" Google Chat space — last ${timeframe}.

1. \`chat_search_conversations\` with displayName containing "${args.space}". If multiple match, pick the one with the most recent activity and tell me which.
2. \`chat_list_messages\` on that space, scoped to the last ${timeframe}.
3. Summarize as:
   - **Decisions** — anything that sounds like a conclusion or commitment
   - **Action items** — tasks called out, with owner if mentioned
   - **Open threads** — questions still hanging
   - **FYI** — links, announcements
4. Highlight any messages that mention me (use my email from \`people_get_user_profile\` if needed).`,
    );
  },
});

const findPerson = createPrompt({
  name: "find_person",
  title: "Find someone's contact info",
  description:
    "Look up a person across the Workspace directory and personal contacts.",
  argsSchema: {
    name: z.string().describe("Name or partial name to search for."),
  },
  execute: ({ args }) =>
    userMessage(
      `Find contact info for: ${args.name}.

1. Try \`people_search_directory_people\` first — this hits the user's Workspace org directory.
2. If no match (or the user has a personal account), fall back to \`people_search_contacts\`.
3. Return: full name, email, job title (if available), department/team. If multiple matches, list up to 5.
4. Don't dump every directory field — only what's useful for "send them an email" or "schedule a meeting".`,
    ),
});

const userPrompts = [
  morningBriefing,
  prepForMeeting,
  whatsOnCalendar,
  findMeetingTime,
  blockFocusTime,
  inboxTriage,
  draftReply,
  findFiles,
  summarizeDoc,
  catchUpChat,
  findPerson,
];

export const prompts = [
  // Agent guides
  agentGuidePrompt,
  calendarGuidePrompt,
  gmailGuidePrompt,
  driveGuidePrompt,
  chatGuidePrompt,
  peopleGuidePrompt,
  // User templates
  ...userPrompts,
];
