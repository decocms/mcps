/**
 * Google Workspace MCP Prompts
 *
 * Static guides covering each service this MCP wraps. Exposed via the MCP
 * `prompts/list` and `prompts/get` interfaces, so an agent can pull just the
 * relevant guide on demand instead of loading every tool description upfront.
 *
 * The tool catalog itself comes from Google's upstream MCPs and lives in
 * `server/tools/generated/`. Re-run `bun run generate-tools` whenever Google
 * ships a new tool — but the guides below should still be hand-curated to
 * reflect the workflow shape.
 */

import { createPrompt } from "@decocms/runtime";

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

export const prompts = [
  agentGuidePrompt,
  calendarGuidePrompt,
  gmailGuidePrompt,
  driveGuidePrompt,
  chatGuidePrompt,
  peopleGuidePrompt,
];
